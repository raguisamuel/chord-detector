# Chord Detector (mobile)

نسخة الموبايل من Chord Detector: بتعرض النوتة أو الكورد اللي بتعزفه، وبتسجل فيديو.
تشتغل على أندرويد من Chrome، وتتسطب على الشاشة الرئيسية زي أي تطبيق.

## رفعها على GitHub (مرة واحدة)
1. ادخل github.com واعمل repository جديد: **New** ← الاسم `chord-detector` ← اختار **Public** ← **Create repository**.
2. في صفحة الـ repo الفاضي، دوس على **uploading an existing file**.
3. افتح فولدر التطبيق على الكمبيوتر، حدد **كل اللي جواه** (الملفات وفولدر `icons`) واسحبهم جوه صفحة الرفع.
   الحجم كله حوالي 3 MB.
4. تحت، دوس **Commit changes**.
5. روح **Settings** ← **Pages**. في **Build and deployment** اختار:
   **Source: Deploy from a branch**، و **Branch: main** و **/ (root)**، وبعدين **Save**.
6. استنى دقيقة أو اتنين. الرابط هيظهر فوق في نفس الصفحة، وهيكون شكله كده:
   `https://اسم-حسابك.github.io/chord-detector/`

## تسطيبها على الموبايل
1. افتح الرابط من **Chrome** على الأندرويد.
2. من القائمة **⋮** اختار **Install app** (أو **Add to Home screen**).
3. هتلاقي أيقونة Chord Detector على الشاشة الرئيسية. بعد أول مرة بتشتغل من غير إنترنت.

## العزف
- اعزف على الكيبورد اللي على الشاشة بصوابعك، وكذا صباع مع بعض بيعمل كورد.
- لف الموبايل بالعرض عشان الكيبورد يبقى أعرض وأسهل في العزف.
- تحت زرار التسجيل مكتوب نوع الفيديو اللي موبايلك بيعمله. MP4 هو اللي واتساب بيقبله.

## تحديث التطبيق بعد كده
ارفع الملفات الجديدة بنفس الطريقة (Add file ← Upload files ← Commit).
لو فيه تحديث، غيّر `VERSION` في `sw.js` (مثلاً `v2`) عشان الموبايلات تاخد النسخة الجديدة.

## صوت البيانو والمكتبات
- Salamander Grand Piano V3 by Alexander Holm (CC-BY 3.0). The app uses the piano sound only, to stay small.
- mp4-muxer by Vanilagy (MIT), used to save the video as a standard MP4 that WhatsApp accepts.
