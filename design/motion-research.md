# Nghiên cứu motion cho Chat Polish

Ngày: 15/10/2026. Mã nguồn tham chiếu: `80c8d2c`.

**Định hướng: giữ đầy đủ các animation gốc và cải thiện cách chúng chạy.** Pulse, row enter, đổi nhãn, disclosure, chevron, popover và cả bảy loader mẫu đều được giữ. Các cải thiện tập trung vào easing, xử lý gián đoạn, trạng thái cuối chính xác và Reduce Motion.

Phạm vi là plugin Chat Polish trong workspace này: chat timeline, merged steps, tool details, working indicator và dashboard. Nghiên cứu dựa trên mã nguồn, ảnh trong `images/` và tài liệu chính thức. Các nhận định về cảm giác, thông số mới và thứ tự ưu tiên là đề xuất thiết kế; chưa có thử nghiệm người dùng, quay chuyển động hay đo hiệu năng trên app đang chạy.

## 1. Motion trong bản gốc `80c8d2c`

| Bề mặt | Hành vi trong mã nguồn | Đánh giá thiết kế |
| --- | --- | --- |
| Tool/thought đang chạy khi được mount | Fade + dịch lên 4 px trong 160 ms qua `useEnter` | Biên độ nhỏ, hợp với mật độ chữ của chat. Cần phân biệt item mới với item đang chạy được mount lại do cuộn. [Mã](../client/views.tsx#L179) |
| Nhãn merged steps | Fade từ opacity 0.25 + dịch lên 4 px trong 240 ms; giữ mỗi nhãn tối thiểu 700 ms | Giữ cả fade và chuyển động; bảo đảm về trạng thái cuối khi animation bị ngắt. [Mã](../client/views.tsx#L163), [hold](../client/views.tsx#L512) |
| Chữ đang xử lý | `usePulse`: opacity 1 → 0.45 → 1 trong 2.2 giây; áp dụng cho verb, task đang chạy và một số notice | Giữ nhịp pulse; loop không chiếm interaction handle và dừng/reset khi tác vụ kết thúc. [Hook](../client/views.tsx#L144), [row](../client/views.tsx#L278), [task](../client/views.tsx#L612) |
| Disclosure | `LayoutAnimation` 200 ms, chevron xoay 200 ms; phần nội dung có `FadeIn` 200 ms | Mở/đóng là chỗ đáng đầu tư. Không thể suy ra chuyển chiều cao trên web chỉ từ lời gọi `LayoutAnimation`. [Mã](../client/views.tsx#L186) |
| Chevron khi hover | Opacity chuyển trong 120 ms | Giữ; bổ sung trạng thái focus bàn phím tương đương hover. [Mã](../client/views.tsx#L255) |
| Popover của host được restyle | 160 ms, dịch lên 4 px, scale 0.98 → 1; đã tránh frame host dùng để đo vị trí | Giữ biên độ nhỏ và logic chờ đặt vị trí; kiểm tra host không chạy thêm hiệu ứng trùng. [Mã](../client/web/restyle-css.ts#L60), [CSS](../client/web/restyle-css.ts#L94) |
| Working indicator | 7 lựa chọn, chu kỳ 0.8–2 giây; Orb còn animate shadow | Dots đang là mặc định. Nên giữ Dots hoặc Spokes làm lựa chọn điềm tĩnh; đánh giá lại chi phí paint của Orb bằng trace. [CSS](../client/web/restyle-css.ts#L17), [mặc định](../shared/timeline.ts#L48) |
| Loader gallery | Mỗi tile render animation thật, không có điều kiện selected/hover để dừng các tile còn lại | Giữ cả bảy mẫu chạy để xem trực tiếp các kiểu motion. [Mã](../client/dashboard/prefs-editor.tsx#L31) |
| Task progress | Thay đổi `width` trong 300 ms | Giữ duration và tỷ lệ task; dùng fill cố định với scaleX từ mép trái. [Mã](../client/views.tsx#L631) |
| Dashboard | Switch, segmented control và chuyển page thay state trực tiếp | Thêm phản hồi nhỏ ở control; nếu cần, fade nội dung page 160 ms. Theme/font preview áp dụng ngay. [Controls](../client/dashboard/controls.tsx#L41), [switch](../client/dashboard/controls.tsx#L103), [page](../client/dashboard.tsx#L11) |
| Jump giữa prompt | Cuộn đến vị trí; outline hiện 900 ms rồi mất dần trong 600 ms | Giữ thao tác định vị nhanh. Tránh thêm hành trình smooth-scroll dài xuyên lịch sử chat. [Mã](../client/web/prompts.ts#L56), [CSS](../client/web/restyle-css.ts#L69) |

## 2. Cơ sở thiết kế

- **Motion phục vụ thay đổi có ý nghĩa.** Apple khuyên chuyển động có mục đích, ngắn và chính xác; tránh animation thừa ở tương tác thường xuyên, cho phép thao tác tiếp mà không đợi hiệu ứng kết thúc. Áp dụng cho plugin: trạng thái và khả năng bấm phải đổi ngay; animation chỉ hỗ trợ nhận biết. [Apple HIG — Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- **Giữ chuyển động gần nơi đang thao tác.** Fluent khuyên duration theo kích thước/khoảng cách, dùng fade ngắn khi đổi trang cấp cao và hạn chế motion ngoài vùng đang chú ý. Áp dụng: mở tool ngay dưới hàng tương ứng, không trượt cả dashboard hoặc làm toàn bộ transcript chuyển động. [Fluent 2 — Motion](https://fluent2.microsoft.design/motion)
- **Cho phép trải nghiệm không motion.** WCAG 2.3.3, mức AAA, đề cập khả năng tắt animation không thiết yếu do tương tác; MDN mô tả `prefers-reduced-motion` để nhận sở thích hệ thống. Áp dụng: bản giảm motion vẫn truyền đầy đủ Running, Failed, Completed qua chữ và icon tĩnh. [W3C — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [MDN — prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion)
- **Hiệu ứng nhỏ vẫn cần kiểm tra pipeline.** web.dev ưu tiên `opacity` và `transform`; thuộc tính gây layout/paint cần được đo. Áp dụng: tránh glow/shadow lặp liên tục và tránh animate chiều cao theo từng chunk text đang stream. [web.dev — High-performance CSS animations](https://web.dev/articles/animations-guide)

Áp dụng các hướng dẫn về easing, interruption và Reduce Motion trong skill Emil Kowalski, cùng yêu cầu giữ các animation gốc của người dùng. Không dùng frequency gate để xóa các hiệu ứng đã có. [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md), [animate](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md)

Các nguồn cung cấp nguyên tắc, không quy định một duration chung cho mọi app. Bộ số phía dưới là điểm khởi đầu để thử riêng cho Chat Polish.

## 3. Bộ motion đề xuất

| Tình huống | Chuyển động đề xuất | Timing ban đầu | Khi giảm motion |
| --- | --- | --- | --- |
| Hover/focus một tool row | Đổi nền/độ rõ, không nhấc cả hàng; focus ring hiện ngay | 120 ms | Đổi ngay |
| Nhấn button/chip | Trạng thái pressed hiện ngay, phục hồi nhẹ; không scale chữ | Phục hồi 120 ms | Đổi ngay |
| Switch | Thumb dịch trong track, không bounce | 120 ms | Thumb đổi vị trí ngay |
| Segmented control | Selected surface chuyển nhẹ; text và kết quả đổi ngay | 120 ms | Đổi ngay |
| Tool/thought mới trong lượt đang chạy | Giữ fade + dịch lên 4 px | 160 ms | Hiện ngay |
| Lịch sử chat, quay lại tab, item cuộn trở lại | Render ở trạng thái ổn định | 0 ms | Giống mặc định |
| Merged label đổi bước | Giữ fade từ 0.25 + dịch lên 4 px; gộp cập nhật nhanh | 240 ms; hold 700 ms | Chữ rõ, translate về 0 |
| Mở tool/merged steps | Chevron xoay, nội dung fade; giữ layout animation trên nền tảng hỗ trợ | 200 ms | Mở ngay |
| Đóng disclosure | Giữ layout animation và chevron của bản gốc; input mới có hiệu lực ngay | 200 ms | Đóng ngay |
| Popover | Sau khi host đặt vị trí, fade + dịch lên 4 px + scale 0.98 → 1, cả pointer và keyboard | 160 ms | Hiện ngay |
| Agent đang làm việc | Giữ working indicator và pulse trên chữ như bản gốc | Pulse 2.2 giây; chu kỳ loader không đổi | Icon và chữ tĩnh |
| Hoàn thành/hủy/lỗi | Dừng loop và đổi thông tin ngay; không bắt chờ hết hold hay animation | 0 ms cho dữ liệu; fade phụ 120 ms nếu cần | Đổi ngay |
| Dashboard đổi page | Đổi ngay; navigation và khung preview giữ vị trí | 0 ms | Giống mặc định |
| Theme/font/rich text preview | Hiển thị đúng kết quả mới ngay, tránh nội suy cả palette hoặc font metrics | 0 ms | Giống mặc định |
| Task progress | Fill có kích thước cố định, scaleX từ mép trái tới tỷ lệ mới nhất | 300 ms | Cập nhật ngay |

Giữ duration gốc: hover 120 ms, enter/popover 160 ms, disclosure 200 ms, label swap 240 ms, progress 300 ms. Label hold 700 ms và loader cycle có mục đích riêng, không phải duration chuyển cảnh.

Easing xuất hiện/phản hồi dùng `cubic-bezier(0.23, 1, 0.32, 1)` theo skill; RN dùng `Easing.bezier` tương ứng. Loop quay giữ `linear`. Không thêm bounce vào text, tool row hay page.

## 4. Điều phối theo trạng thái

### Một lượt agent bình thường

1. Người dùng gửi: thao tác được ghi nhận ngay, thông tin đang xử lý xuất hiện. Không đợi hiệu ứng hoàn thành mới cho nhập tiếp.
2. Tool đầu tiên chạy: row fade và dịch nhẹ như bản gốc. Indicator chuyển động, chữ trạng thái giữ pulse quen thuộc.
3. Tool chạy liên tiếp: merged label giữ nhịp 700 ms, nhận giá trị mới nhất và chạy fade/rise khi đổi bước. Trạng thái cuối bypass hold.
4. Có câu trả lời: nội dung stream theo cơ chế host; không fade từng token, không chạy lại enter cho cả câu sau mỗi chunk.
5. Hoàn thành: dừng indicator ngay, thay bằng summary tĩnh. Không thêm animation ăn mừng cho từng tool call.

`ThoughtItem` đã dùng `useRevealedText`; Paseo cũng cung cấp hook này cho pacing text và mô tả identity renderer ổn định trong quá trình stream. Nên tiếp tục dùng cơ chế host. [Mã hiện tại](../client/views.tsx#L549), [Paseo — Timeline items](https://paseo.sh/docs/plugins/reference#timeline-items)

### Lỗi hoặc hủy

Đưa trạng thái cuối ra ngay, độc lập với hold của nhãn. Dừng pulse/spinner, dùng chữ và icon cùng màu trạng thái. Với tùy chọn tự mở lỗi, giữ hàng lỗi trong viewport; nếu người dùng đang đọc nơi khác, ưu tiên báo lỗi tại hàng thay vì kéo họ về vị trí đó. Đây là hành vi thiết kế đề xuất cần thử trên host.

### Loader gallery

Cả bảy mẫu tiếp tục animate như bản gốc. Việc chọn một mẫu chỉ quyết định working indicator dùng trong chat. Khi Reduce Motion bật, các mẫu hiển thị tĩnh; khi rời page, gallery được unmount.

### Mở/đóng chi tiết

Giữ fade nội dung, xoay chevron và layout animation có sẵn. Output dài và nội dung stream không có height animation bổ sung theo từng chunk. Bấm lần hai phải theo trạng thái mới nhất, không khóa thao tác để chờ hiệu ứng.

## 5. Những điểm cần kiểm chứng trước khi triển khai

**Disclosure trên web.** `useDisclosure` gọi `LayoutAnimation`, nhưng source React Native Web upstream hiện tại có `configureNextLayoutAnimation` chỉ gọi callback, không animate layout. Đây là bằng chứng không nên mặc định hiệu ứng native sẽ chạy trên web; chưa xác nhận phiên bản React Native Web thực tế của Paseo đang dùng. Cần kiểm tra build host. [Source upstream](https://github.com/necolas/react-native-web/blob/master/packages/react-native-web/src/exports/UIManager/index.js), [lời gọi trong plugin](../client/views.tsx#L190)

**Giảm motion giữa animation.** `useTween` có nhánh đặt ngay giá trị đích; `usePulse` reset opacity về 1. `useSwap` lại dừng animation cũ rồi return khi reduced bật, chưa đặt giá trị về trạng thái cuối. Theo luồng mã, label có thể dừng ở opacity/translate trung gian; cần tái hiện và bảo đảm opacity 1, translate 0 trong bản giảm motion. Đây là suy luận từ code, chưa phải lỗi đã tái hiện. [Mã](../client/views.tsx#L131), [useSwap](../client/views.tsx#L163)

**Phạm vi CSS giảm motion.** Dots, loader overlay và popover có media query riêng. Spinner provider rail dùng selector `[data-cp-rail] [data-cp-status="loading"] svg` chưa nằm trong các selector tắt animation đó. Cần fallback tĩnh đồng nhất và kiểm tra motion từ host còn chạy hay không, kể cả khi đã tắt CSS animation của plugin. [Loader rules](../client/web/restyle-css.ts#L27), [rail spinner](../client/web/model-picker.ts#L60)

**Loop và danh sách.** `usePulse` hiện chưa đặt `isInteraction: false`. React Native ghi nhận animation loop có thể cản việc render thêm row của `VirtualizedList`; cấu hình này là một điểm cần xem xét nếu giữ loop ở component dùng chung. Đây là khả năng được tài liệu mô tả, không phải kết luận app đang giật. [Mã](../client/views.tsx#L151), [React Native 0.81 — Animated.loop](https://reactnative.dev/docs/0.81/animated#loop)

**Height và progress.** Không dùng mẹo `max-height` cực lớn làm mặc định. `interpolate-size` có thể hỗ trợ kích thước intrinsic nhưng còn phụ thuộc engine; dùng enhancement có fallback. Với task progress, chỉ chuyển từ width sang `scaleX` nếu trace cho thấy cần tối ưu, và giữ mép trái cố định. [MDN — interpolate-size](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/interpolate-size), [web.dev — Performance](https://web.dev/articles/animations-guide)

**Lựa chọn công cụ.** Tận dụng `Animated`, `Easing`, `AccessibilityInfo` và CSS đang có. Chưa có nhu cầu được chứng minh để thêm Motion/Framer/Reanimated. Paseo cung cấp React và React Native qua runtime của host; cần kiểm tra hợp đồng build trước khi chọn dependency mới. Giữ CSS/DOM trong nhánh desktop/web đã có, các renderer dùng chung tiếp tục dùng primitive React Native. [Paseo — Runtime modules và cross-platform rules](https://paseo.sh/docs/plugins/reference#runtime-modules)

## 6. Quyền kiểm soát motion

Mặc định theo Reduce Motion của hệ điều hành/trình duyệt. Có thể thêm một lựa chọn đơn giản “Giảm chuyển động” để người dùng chủ động dùng bản tĩnh ngay trong app; khi hệ thống đã yêu cầu giảm motion thì luôn ưu tiên yêu cầu đó. Không cần thêm nhiều mức cường độ hoặc một trang cấu hình motion riêng ở giai đoạn đầu.

Lựa chọn này dừng chuyển động lặp nhưng vẫn giữ trạng thái tác vụ và kết quả cập nhật. Loader trang trí tự chạy cạnh transcript cần được đánh giá theo điều kiện của WCAG 2.2.2: tự bắt đầu, kéo dài trên 5 giây, xuất hiện cùng nội dung khác, có ngoại lệ cho chuyển động thiết yếu. Không mặc định mọi spinner đều thuộc ngoại lệ preload. Đây là hướng để thiết kế quyền kiểm soát, không phải kết luận đánh giá tuân thủ của app. [W3C — Pause, Stop, Hide, Level A](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

## 7. Thứ tự thực hiện

| Ưu tiên | Thay đổi | Lý do |
| --- | --- | --- |
| P0 | Khôi phục đầy đủ pulse, enter, swap, disclosure, chevron và popover | Giữ trải nghiệm motion người dùng yêu cầu |
| P0 | Fallback giảm motion đầy đủ, xử lý đổi preference giữa animation | Tránh label mờ/dịch dở và loop bị bỏ sót |
| P0 | Giữ cả bảy loader mẫu hoạt động | Bảo toàn preview animation gốc |
| P1 | Giữ fade/rise và hold 700 ms; easing thống nhất, terminal bypass hold | Motion quen thuộc cùng thông tin trạng thái chính xác |
| P1 | Giữ disclosure animation; thử output ngắn, dài và stream | Kiểm chứng gián đoạn và thay đổi layout |
| P2 | Press feedback ở control; page tiếp tục đổi ngay | Hoàn thiện dashboard theo tần suất sử dụng |

Nếu triển khai, gom các giá trị và hook motion đang có vào một module nhỏ khi điều đó giảm trùng lặp. Không xây motion engine hay thêm abstraction trước khi có nhu cầu.

## 8. Kịch bản kiểm chứng

- Chạy một lượt có nhiều tool rất nhanh: nhãn không flicker, không xếp hàng animation; lỗi/hủy/hoàn thành hiện ngay.
- Mở merged steps trong lúc agent chạy: pulse và các hiệu ứng gốc vẫn hoạt động; tác vụ kết thúc thì dừng loop.
- Mở rồi đóng nhanh một tool output dài; mở output đang stream: thao tác cuối thắng, viewport giữ được mốc đọc, không còn khoảng trống treo.
- Cuộn xa rồi quay lại, đổi tab và trở lại: lịch sử không chạy lại enter; không nhầm mount với sự kiện item mới.
- Bật giảm motion trước khi mở app và đổi trong lúc label đang fade: tất cả label kết thúc ở trạng thái đọc rõ, indicator tĩnh vẫn nói được tác vụ đang chạy.
- Dùng bàn phím trên dashboard: control có focus rõ; animation không bị tắt chỉ vì input là keyboard.
- Ghi performance trace trên bản host mục tiêu: so sánh trước/sau ở gallery 7 loaders, merged steps mở, transcript dài và Orb; kiểm tra layout/paint, dropped frames, loop ngoài vùng nhìn. Không cam kết FPS trước khi đo.

Tiêu chí chọn bản cuối: người dùng nhận biết tác vụ và thay đổi vị trí dễ hơn, đọc liên tục được, thao tác không phải chờ animation. Các con số đề xuất cần được điều chỉnh theo thử nghiệm trên Paseo desktop/web thực tế.
