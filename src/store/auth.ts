import { create } from "zustand";
import {
  api,
  deskApi,
  get,
  setToken,
  setUnauthorizedHandler,
} from "../lib/api";
import type { Audience, Space, Tag, UserInfo } from "../lib/types";
import { toast } from "./ui";

interface AuthState {
  user: UserInfo | null;
  ready: boolean;
  spaces: Space[];
  tags: Tag[];
  login: (email: string, password: string) => Promise<void>;
  logout: (expired?: boolean) => void;
  loadCatalog: () => Promise<void>;
  /** Người đọc chọn khối làm việc lần đầu (máy chủ chặn tự đổi về sau). */
  setAudience: (audience: Audience) => Promise<void>;
}

const KEY = "memorable.session";

export const useAuth = create<AuthState>((set, get_) => ({
  user: null,
  ready: false,
  spaces: [],
  tags: [],
  login: async (email, password) => {
    const rd = await api<{ token: string; user: UserInfo }>(
      "POST",
      "/user/login",
      { body: { email, password }, auth: false },
    );
    setToken(rd.token);
    localStorage.setItem(
      KEY,
      JSON.stringify({ token: rd.token, user: rd.user, at: Date.now() }),
    );
    deskApi().setConfig({ email });
    set({ user: rd.user });
    void api("POST", "/usage-events", { body: { event_type: "login" } }).catch(
      () => undefined,
    );
    await get_().loadCatalog();
  },
  logout: (expired) => {
    setToken(null);
    localStorage.removeItem(KEY);
    set({ user: null, spaces: [], tags: [] });
    if (expired)
      toast.warn(
        "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      );
  },
  loadCatalog: async () => {
    const [spaces, tags] = await Promise.all([
      get<Space[]>("/spaces").catch(() => []),
      get<Tag[]>("/tags").catch(() => []),
    ]);
    set({ spaces: spaces || [], tags: tags || [] });
  },
  setAudience: async (audience) => {
    await api("PUT", "/user/audience", { body: { audience } });
    const user = get_().user;
    if (!user) return;
    const next = { ...user, audience };
    set({ user: next });
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) localStorage.setItem(KEY, JSON.stringify({ ...JSON.parse(raw), user: next }));
    } catch {
      /* phiên lưu hỏng thì bỏ qua, lần sau đăng nhập lại */
    }
  },
}));

setUnauthorizedHandler(() => {
  if (useAuth.getState().user) useAuth.getState().logout(true);
});

/** Phiên còn hạn không: đọc thời hạn thật trong mã phiên (máy chủ có thể đặt 1 giờ hay 9 giờ); không đọc được thì coi là 55 phút. */
function sessionAlive(token: string, savedAt: number) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = Number(JSON.parse(atob(b64)).exp);
    if (Number.isFinite(exp) && exp > 0) return exp * 1000 - Date.now() > 60 * 1000;
  } catch {
    /* mã phiên lạ: dùng mức mặc định bên dưới */
  }
  return Date.now() - savedAt < 55 * 60 * 1000;
}

/** Khôi phục phiên (token còn hạn 1 giờ) khi mở lại ứng dụng. */
export async function bootstrapAuth() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as {
        token: string;
        user: UserInfo;
        at: number;
      };
      if (sessionAlive(s.token, s.at)) {
        setToken(s.token);
        const me = await get<UserInfo>("/user/profile"); // xác thực token thật sự còn dùng được
        useAuth.setState({ user: me });
        await useAuth.getState().loadCatalog();
      } else localStorage.removeItem(KEY);
    }
  } catch {
    setToken(null);
    localStorage.removeItem(KEY);
  } finally {
    useAuth.setState({ ready: true });
  }
}

export const spaceName = (id?: number) =>
  useAuth.getState().spaces.find((s) => s.id === id)?.name;
