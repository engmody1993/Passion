import wolfjs from 'wolf.js';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import { Jimp } from 'jimp';

const { WOLF } = wolfjs;
const service = new WOLF();

const CONFIG = {
    MONITOR_GROUP: 81889058,
    RESULT_ROOM: 81889058
};

// اللون الذهبي للإطار
const TARGET_COLOR = { r: 240, g: 190, b: 70 }; 

async function solveCaptcha(imageUrl) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const image = await Jimp.read(response.data);

        let minX = image.bitmap.width, maxX = 0;
        let minY = image.bitmap.height, maxY = 0;
        let found = false;

        image.scan(0, 0, image.bitmap.width, image.bitmap.height, (x, y, idx) => {
            const r = image.bitmap.data[idx];
            const g = image.bitmap.data[idx + 1];
            const b = image.bitmap.data[idx + 2];

            if (Math.abs(r - TARGET_COLOR.r) < 60 && 
                Math.abs(g - TARGET_COLOR.g) < 60 && 
                Math.abs(b - TARGET_COLOR.b) < 60) {
                
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                found = true;
            }
        });

        if (!found) return null;

        // قص دقيق للمنطقة
        const finalBlock = image.clone().crop({ x: minX, y: minY, w: (maxX - minX), h: (maxY - minY) });

        // معالجة قوية لإظهار النص
        await finalBlock.greyscale().contrast(0.8).threshold({ max: 150, replace: 255 });
        const buffer = await finalBlock.getBuffer('image/png');

        // القراءة: إضافة اللغة العربية (ara) وضبط نمط السطر الواحد (PSM 7)
        const { data: { text } } = await Tesseract.recognize(buffer, 'ara+eng', {
            tessedit_pageseg_mode: '7', 
            tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzابتثجحخدذرزسشصضطظعغفقكلمنهوي'
        });

        return text.trim();
    } catch (err) {
        console.error("❌ خطأ OCR:", err.message);
        return null;
    }
}

service.on('groupMessage', async (message) => {
    if (message.targetGroupId !== CONFIG.MONITOR_GROUP) return;

    let imageUrl = null;
    if (message.attachments && message.attachments.length > 0) imageUrl = message.attachments[0].link;
    else if (message.body && message.body.match(/\.(jpg|jpeg|png)$/)) imageUrl = message.body;

    if (imageUrl) {
        console.log("📸 جاري الحل...");
        const result = await solveCaptcha(imageUrl);
        
        if (result && result.length > 0) {
            console.log(`🔑 النتيجة: ${result}`);
            await service.messaging.sendGroupMessage(CONFIG.RESULT_ROOM, `# ${result}`);
        }
    }
});

service.login(process.env.U_MAIL, process.env.U_PASS);
