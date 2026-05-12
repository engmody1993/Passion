import 'dotenv/config';
import wolfjs from 'wolf.js';

const { WOLF } = wolfjs;

const settings = {
    identity: process.env.U_MAIL,
    secret: process.env.U_PASS,
    targetIds: [80055399, 0], 
    targetRoomId: 9969,        
    allianceId: "5550005",
    commandDelay: 2300        // التأخير بين الأوامر (1.5 ثانية)
};

const service = new WOLF();

// دالة الانتظار
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

service.on('ready', () => {
    console.log(`✅ المتصيد الذكي متصل: ${service.currentSubscriber.nickname}`);
});

service.on('message', async (message) => {
    // مراقبة الخاص من العضويات المحددة
    if (!message.isGroup && settings.targetIds.includes(message.authorId)) {
        
        const content = (message.body || "").trim();

        // 1. حالة: !او موسم قطع
        if (content.includes("!او موسم قطع")) {
            console.log(`✨ رصد "موسم قطع" - الانتظار قبل الإرسال...`);
            await sleep(settings.commandDelay);
            await service.messaging.sendGroupMessage(settings.targetRoomId, "!مد موسم قطع");
            return;
        }

        // 2. حالة: !او مزاد
        const auctionMatch = content.match(/!او مزاد\s+(\d+)/);

        if (auctionMatch) {
            const auctionId = auctionMatch[1];
            console.log(`💰 رصد مزاد [${auctionId}] - بدء تنفيذ الأوامر مع فواصل زمنية...`);

            try {
                // تنفيذ الأمر الأول (السحب)
                await service.messaging.sendGroupMessage(
                    settings.targetRoomId, 
                    `!مد تحالف سحب ${settings.allianceId}`
                );

                // الانتظار قبل إرسال الأمر الثاني
                console.log(`⏳ انتظار ${settings.commandDelay}ms قبل المزايدة...`);
                await sleep(settings.commandDelay);

                // تنفيذ الأمر الثاني (المزايدة)
                await service.messaging.sendGroupMessage(
                    settings.targetRoomId, 
                    `!مد مزايدة ${auctionId} ${settings.allianceId}`
                );
                
                console.log(`🚀 تم الانتهاء من إرسال أوامر المزاد.`);
            } catch (err) {
                console.error(`❌ فشل في الإرسال: ${err.message}`);
            }
        }
    }
});

service.on('error', (err) => console.error(`⚠️ خطأ: ${err.message}`));

service.login(settings.identity, settings.secret);
