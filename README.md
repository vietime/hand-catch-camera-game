# Hứng Điểm Bằng Tay

Prototype game HTML5/PWA dùng camera điện thoại và MediaPipe Hand Landmarker.

## Chạy local

Dùng một static server bất kỳ:

```powershell
.\start-server.ps1
```

Mở trên máy tính:

```text
http://localhost:5173
```

## Test trên điện thoại

Camera trên điện thoại cần HTTPS. Có 2 cách nhanh:

1. Deploy thư mục này lên Netlify, Vercel hoặc GitHub Pages.
2. Chạy `.\start-server.ps1` và dùng HTTPS tunnel như Cloudflare Tunnel hoặc ngrok.

Sau khi mở link HTTPS trên điện thoại, bấm `Bắt đầu`, cấp quyền camera, đưa bàn tay vào khung hình và hứng các điểm rơi.

## Ghi chú kỹ thuật

- Camera: `navigator.mediaDevices.getUserMedia()`
- Nhận diện tay: `@mediapipe/tasks-vision`
- Render game: HTML Canvas
- PWA: `manifest.webmanifest` và `sw.js`
