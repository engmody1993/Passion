import wolfjs from 'wolf.js';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import { Jimp } from 'jimp';

const { WOLF } = wolfjs;
const service = new WOLF();

// --- الإعدادات ---
const CONFIG = {
    MONITOR_GROUP: 81889058, // ضع معرف الروم الخاص بك هنا
    RESULT_ROOM: 9969        // الروم الذي سيتم إرسال الحل فيه
};

// اللون المستهدف للإطار (الأحمر الغامق #490b0c)
const TARGET_COLOR = { r: 73, g: 11, b: 12 };

async function solveCaptcha(imageUrl) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const image = await Jimp.read(response.data);

        let minX = image.bitmap.width, maxX = 0;
        let minY = image.bitmap.height, maxY = 0;
        let found = false;

        // 1. البحث عن الإطار الأحمر الغامق
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
            const r = image.bitmap.data[idx];
            const g = image.bitmap.data[idx + 1];
            const b = image.bitmap.data[idx + 2];

            // سماحية 60 لضمان التقاط اللون حتى مع تفاوت الإضاءة
            if (Math.abs(r - TARGET_COLOR.r) < 60 && 
                Math.abs(g - TARGET_COLOR.g) < 60 && 
                Math.abs(b - TARGET_COLOR.b) < 60) {
                
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                found = true;
            }
        });

        if (!found) return null;

        // 2. قص المنطقة (إضافة هامش بسيط 5 بكسل)
        const cropWidth = (maxX - minX) + 10;
        const cropHeight = (maxY - minY) + 10;
        const finalBlock = image.clone().crop({ x: minX - 5, y: minY - 5, w: cropWidth, h: cropHeight });

        // 3. تحويل الصورة لأسود وأبيض نقي لزيادة دقة القراءة
        await finalBlock.greyscale().contrast(1).normalize();
        const buffer = await finalBlock.getBuffer('image/png');

        // 4. القراءة (مع ضبط نمط السطر الواحد)
        const { data: { text } } = await Tesseract.recognize(buffer, 'ara+eng', {
            tessedit_pageseg_mode: '7', // نمط السطر الواحد
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهوي'
        });

        return text.trim();
    } catch (err) {
        console.error("❌ خطأ:", err.message);
        return null;
    }
}

// --- المراقبة ---
service.on('groupMessage', async (message) => {
    // التحقق من الروم (يسمح فقط بالروم المحدد)
    if (message.targetGroupId !== CONFIG.MONITOR_GROUP) return;

    let imageUrl = null;
    if (message.attachments && message.attachments.length > 0) imageUrl = message.attachments[0].link;
    else if (message.body && message.body.match(/\.(jpg|jpeg|png)$/)) imageUrl = message.body;

    if (imageUrl) {
        console.log("📸 تم اكتشاف صورة، جاري القص والتحليل...");
        const result = await solveCaptcha(imageUrl);
        
        if (result && result.length > 0) {
            console.log(`🔑 النص المستخرج: ${result}`);
            // إرسال النص كرسالة في الروم
            await service.messaging.sendGroupMessage(CONFIG.RESULT_ROOM, `# ${result}`);
        }
    }
});

service.login(process.env.U_MAIL, process.env.U_PASS);
