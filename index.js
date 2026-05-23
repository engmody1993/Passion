import 'dotenv/config';
import wolfjs from 'wolf.js';
const { WOLF } = wolfjs;

// الإعدادات
const settings = {
    identity: process.env.U_MAIL || 'your_email@example.com',
    secret: process.env.U_PASS || 'your_password',
    taskGroupId: 224,
    depositGroupId: 224,
    // التوقيتات بالملي ثانية
    tasksInterval: 63 * 1000, // كل 63 ثانية
    boxInterval: 3 * 60 * 1000 // كل 3 دقائق
};

const MY_INFO = { myId: "80055399" };
const service = new WOLF();

// دالة تأخير عامة
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

service.on('groupMessage', async (message) => {
    try {
        const content = message.body;
        const isTargetGroup = message.targetGroupId === settings.taskGroupId || message.targetGroupId === settings.depositGroupId;
        if (!isTargetGroup) return;

        // التحقق من الفخاخ
        if (content.includes("تحقق") && content.includes(MY_INFO.myId)) {
            
            // تأخير 3 ثواني قبل الرد ليبدو طبيعياً
            await delay(3000);

            // --- فخ 1: الرموز ---
            if (content.includes("العلامتين")) {
                const symMatch = content.match(/العلامتين\s*([^\s\w\u0600-\u06FF])\s*و\s*([^\s\w\u0600-\u06FF])/u);
                if (symMatch) {
                    const pattern = new RegExp(`${escapeRegExp(symMatch[1])}(.*?)${escapeRegExp(symMatch[2])}`, 'gu');
                    const matches = [...content.matchAll(pattern)];
                    if (matches.length > 0) {
                        const target = matches.length > 1 ? matches[1] : matches[0];
                        await service.messaging.sendGroupMessage(message.targetGroupId, `#${target[1].trim()}`);
                    }
                }
            }
            // --- فخ 2: القوسين () ---
            else if (content.includes("داخل القوسين")) {
                const match = content.match(/\((.*?)\)/);
                if (match) await service.messaging.sendGroupMessage(message.targetGroupId, `#${match[1].trim()}`);
            }
            // --- فخ 3: الأقواس المعقوفة {} ---
            else if (content.includes("الأقواس المعقوفة")) {
                const match = content.match(/\{(.*?)\}/);
                if (match) await service.messaging.sendGroupMessage(message.targetGroupId, `#${match[1].trim()}`);
            }
            // --- فخ 4: الاتجاهات ---
            else if (content.includes("يمين") || content.includes("يسار")) {
                const symMatch = content.match(/للعلامة\s*([^\s])/u);
                const dirMatch = content.match(/(اليمين|يمين|اليسار|يسار)/u);
                if (symMatch && dirMatch) {
                    const regex = new RegExp(`([^\\s]+)\\s*${escapeRegExp(symMatch[1])}\\s*([^\\s]+)`, 'gu');
                    const matches = [...content.matchAll(regex)];
                    if (matches.length > 0) {
                        const target = matches.length > 1 ? matches[1] : matches[0];
                        const answer = dirMatch[0].includes("يمين") ? target[2] : target[1];
                        await service.messaging.sendGroupMessage(message.targetGroupId, `#${answer}`);
                    }
                }
            }
            // --- فخ 5: القوائم المفصولة بـ | ---
            else if (content.includes("الرمز رقم")) {
                const indexMatch = content.match(/رقم\s*(\d+)/u);
                const listMatch = content.match(/⁦(.*?)\s*⁩/u);
                
                if (indexMatch && listMatch) {
                    const items = listMatch[1].split('|').map(s => s.trim());
                    const index = parseInt(indexMatch[1]) - 1;
                    
                    if (items[index]) {
                        await service.messaging.sendGroupMessage(message.targetGroupId, `#${items[index]}`);
                    }
                }
            }
        }
    } catch (err) { console.error("خطأ:", err); }
});

service.on('ready', async () => {
    console.log(`🚀 البوت نشط وجاهز للعمل.`);
    await service.group.joinById(settings.taskGroupId);
    await service.group.joinById(settings.depositGroupId);

    // جدولة مهام الميد (مع تأخير ثانيتين بين الأوامر)
    setInterval(async () => {
        await service.messaging.sendGroupMessage(settings.taskGroupId, '!مد مهام');
        await delay(2000); // تأخير ثانيتين
        await service.messaging.sendGroupMessage(settings.depositGroupId, '!مد تحالف ايداع');
    }, settings.tasksInterval);

    // جدولة فتح الصناديق
    setInterval(async () => {
        await service.messaging.sendGroupMessage(settings.taskGroupId, '!مد صندوق فتح');
    }, settings.boxInterval);
});

service.login(settings.identity, settings.secret);
