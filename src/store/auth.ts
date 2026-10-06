import { create } from "zustand";
import {
  api,
  deskApi,
  get,
  setToken,
  setUnauthorizedHandler,
} from "../lib/api";
import type { Space, Tag, UserInfo } from "../lib/types";
import { toast } from "./ui";

interface AuthState {
  user: UserInfo | null;
  ready: boolean;
  spaces: Space[];
  tags: Tag[];
  login: (email: string, password: string) => Promise<void>;
  logout: (expired?: boolean) => void;
  loadCatalog: () => Promise<void>;
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
        "Phiên đăng nhập đã hết hạn (token sống 1 giờ). Vui lòng đăng nhập lại.",
      );
  },
  loadCatalog: async () => {
    const [spaces, tags] = await Promise.all([
      get<Space[]>("/spaces").catch(() => []),
      get<Tag[]>("/tags").catch(() => []),
    ]);
    set({ spaces: spaces || [], tags: tags || [] });
  },
}));

setUnauthorizedHandler(() => {
  if (useAuth.getState().user) useAuth.getState().logout(true);
});

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
      if (Date.now() - s.at < 55 * 60 * 1000) {
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
