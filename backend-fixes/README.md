# Đề xuất sửa backend Memorable (từ đợt test giao diện người đọc, 06/10/2026)

Test trên backend thật chạy tại máy cục bộ (cổng 3001), tài khoản người đọc thử `ui-test-reader@example.test`.
Bộ test backend hiện tại: **444/444 đạt**. Sau khi áp bản vá dưới đây: **450/450 đạt** (1 test cập nhật theo câu báo tiếng Việt, 6 test mới).

## 1. Trích dẫn nguồn không thống nhất + lộ thuật ngữ kỹ thuật — `0001-trich-dan-va-loi-van.patch`

> **Trạng thái: ĐÃ ÁP DỤNG vào backend ngày 06/10/2026** (cùng đợt thêm Nhập tri thức thông minh; toàn bộ test backend 466/466 đạt).

**Hiện tượng (người đọc thấy):**
- `/ai/ask`, `/ai/ask-file`, `/knowledge/compare` trả trích dẫn dạng `[44]`, trong khi Agent dùng `[doc:44]`. Giao diện không biết `[44]` là nguồn hay số thường.
- Phần lưu ý/so sánh có chữ "tier unreviewed", "approved", "OCR"… vì prompt dùng nhãn tiếng Anh và không dặn AI viết cho người không rành kỹ thuật.
- Khi câu trả lời bị giữ lại vì không có nguồn hợp lệ, `caveats` là câu **tiếng Anh**: "The answer had no valid source and was withheld." (cả `/ai/ask` documents, hybrid và `/ai/ask-file`). Ghi chú so sánh `note` cũng tiếng Anh.

**Nguyên nhân:** prompt chỉ yêu cầu liệt kê id trong trường `citations`, không quy định cách trích trong văn bản; không có bước hậu kiểm định dạng trích dẫn (Agent thì có `CITE_RE` trong `agent/runtime.js`).

**Sửa:**
- Thêm `src/services/ai/citeText.js`:
  - `CITE_RULE` / `PLAIN_RULE`: quy tắc thêm vào prompt — trích `[doc:ID]`, không dùng nhãn nội bộ, xưng "bạn".
  - `normalizeCites(text, ids)`: `[12]`/`[doc:12]` của tài liệu thật → `[doc:12]`; `[doc:99]` không thuộc tài liệu đã gửi → gỡ; `[3]` thường → giữ nguyên.
  - Câu báo tiếng Việt: `WITHHELD_VI`, `WITHHELD_PART_VI`, `COMPARE_NOTE_VI`.
- `tasks.js`: áp dụng cho `askDocuments`, `askHybrid`, `validConflicts`, `compareDocuments` (chuẩn hóa mọi chuỗi trả về).
- `knowledge/askFiles.js`: áp dụng cho `answer`, `caveats`; trường `need` viết theo ngôi "Bạn cần …".

**Áp dụng (từ thư mục `Memorable`):**
```
git apply ../MemorablePOS/backend-fixes/0001-trich-dan-va-loi-van.patch
npx jest
```
(Đã kiểm `git apply --check` sạch trên mã nguồn hiện tại. Giao diện đã tự xử lý cả `[44]` lẫn `[doc:44]`, nên áp hay chưa áp đều hiển thị đúng; bản vá làm dữ liệu API sạch cho mọi client.)

## 2. Test backend ghi vào cơ sở dữ liệu đang dùng (dữ liệu rác người đọc nhìn thấy)

**Hiện tượng:** trong lúc test, người đọc thấy chủ đề `KNW-muw526fi`, thẻ `KNW-muw526fi-Thu-cong`, `KNW-muw526fi-Trung2` và các bài `KNW-… ` ở trang Duyệt thư viện / Mới cập nhật; bài bị xóa giữa chừng (ví dụ #72) vẫn nằm trong danh sách "Đã xem" của người dùng. Script tạo dữ liệu tiền tố `KNW-` **không có trong repo** (có thể chạy từ máy khác hoặc đã xóa). `scripts/e2eAi.js` (tiền tố `E2E-AI-`) cũng tạo dữ liệu thật qua API.

**Đề xuất:**
- Chạy script e2e/kiểm tra trên **cơ sở dữ liệu riêng** (ví dụ `DB_NAME=memorable_test`) hoặc server riêng; không chạy vào `memorable_db` mà người dùng đang dùng.
- Script phải dọn **cả** chủ đề (space) và thẻ đã tạo, không chỉ bài viết, kể cả khi lỗi giữa chừng (`try/finally`).
- (Tùy chọn) `GET /items`, `/spaces`, `/tags` ẩn bản ghi có tiền tố test với vai trò reader.

## 3. Chất lượng dữ liệu thẻ

Các thẻ đặt tên kiểu mã lẫn với tên tiếng Việt: `tai-lieu` (3 bài), `bai-viet`, `hinh-anh`, `so-lieu` (0 bài).
Đề xuất: kiểm duyệt viên vào **Thẻ và nhóm kiến thức** → *Gộp* `tai-lieu` vào thẻ tiếng Việt tương ứng (tên cũ thành bí danh), xóa 3 thẻ chưa dùng; hoặc đổi tên thành "Tài liệu", "Bài viết", "Hình ảnh", "Số liệu".

## 4. Ghi chú về trí nhớ Agent (đã xử lý ở giao diện, không cần sửa backend)

Chế độ "Chỉ đọc trên máy" dùng Agent riêng ("Trợ lý đọc tệp"). Bản giao diện cũ tạo Agent này với trí nhớ bật, nên đoạn trích tệp riêng bị lưu thành ký ức và lịch sử hội thoại trên máy chủ.
Giao diện mới: tạo Agent với `use_memory=false`, xóa ký ức cũ của Agent đó, xóa hội thoại khi người dùng bỏ tệp/rời trang và dọn hội thoại sót mỗi phiên. Backend đã tôn trọng `use_memory=false` đúng.

Lưu ý: với Agent `use_memory=false`, backend vẫn tóm tắt hội thoại ở nền (`processConversation` → `AiConversation.summary`) vì bản tóm tắt còn dùng làm ngữ cảnh cho hội thoại dài — đúng thiết kế. Giao diện xóa hội thoại nên bản tóm tắt cũng bị xóa theo. Nếu muốn tiết kiệm chi phí AI, có thể cân nhắc chỉ tóm tắt khi hội thoại vượt số tin nhắn giữ trong lịch sử.

## 5. Đã thêm vào backend: Nhập tri thức thông minh (06/10/2026)

- `POST /ai/draft-item` (tệp, multipart, tối đa 5) và `POST /ai/draft-item/text` (văn bản dán, JSON) — quyền `item:write`, giới hạn AI như các API AI khác, cờ tính năng `ai_feature_smart_import`.
- Mã: `src/services/knowledge/smartImport.js`, controller `ai.controller.js` (`draftItem`, `draftItemText`), route `routes/workspace.js`, schema `aiDraftItemText`, tài liệu `docs/summaries.js`, `docs/details.js`, `docs/fields.js`.
- Không lưu gì: trả bản nháp đầy đủ trường + độ tin cậy/căn cứ từng trường + mục trùng; giao diện tạo mục qua `POST /items` sau khi người dùng xem lại.
- An toàn: tệp có bí mật bị bỏ qua; văn bản có bí mật bị từ chối trước khi gửi AI; nội dung tệp/văn bản không thể "thoát khung" prompt (gỡ thẻ khung); chỉ nhận mảng/thẻ có thật, ngày hợp lệ, tên biến hợp lệ.
- Test: `tests/smartImport.test.js` (16 test: luồng đủ, làm sạch đầu ra AI, tách chủ đề, OCR, bí mật, chống thoát khung, tắt tính năng, HTTP 403/422/400/200). Chạy thật trên máy chủ cục bộ: runbook máy in (4 bước, đúng ngày hiệu lực), tệp 2 chủ đề (tách đúng 2 bản nháp), nội dung trùng (phát hiện 2 mục TEAMWORK RULE).
- Swagger ở cổng 3002 cần chạy lại `npm run docs` (và `npm run docs:build` nếu dùng tệp tĩnh trong `docs/`) để hiện 2 API mới.
