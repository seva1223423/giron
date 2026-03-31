import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const getAnthropicClient = () => {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

const SYSTEM_PROMPT = `Ты — ИИ-тренер в приложении Iron Gym. Ты помогаешь пользователям с тренировками, питанием, техникой упражнений и восстановлением.

Твои возможности:
1. Составление и изменение программ тренировок
2. Расчёт КБЖУ и рекомендации по питанию
3. Объяснение техники упражнений
4. Адаптация нагрузки под уровень и цели
5. Рекомендации по восстановлению
6. Работа с травмами и ограничениями

Правила:
- Отвечай на русском языке
- Давай конкретные, научно обоснованные рекомендации
- Учитывай профиль пользователя (уровень, цели, ограничения)
- Будь дружелюбным, но профессиональным
- Если пользователь жалуется на боль — рекомендуй обратиться к врачу
- Форматируй ответы для удобного чтения
- Используй данные пользователя для персонализации ответов

Когда пользователь просит изменить программу или данные профиля, отвечай конкретными изменениями.`;

// Chat with AI
router.post('/chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Сообщение обязательно' });

    // Get user profile
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: { healthRestrictions: true },
    });

    // Get recent chat history
    const history = await prisma.chatMessage.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // Get active program
    const activeProgram = await prisma.program.findFirst({
      where: { userId: req.userId, isActive: true },
      include: {
        workouts: {
          include: { exercises: { include: { exercise: true, sets: true } } },
        },
      },
    });

    // Build context
    const userContext = user
      ? `Профиль: ${user.firstName}, ${user.gender || 'не указан'}, ${user.heightCm || '?'}см, ${user.weightKg || '?'}кг, цель: ${user.goal || 'не указана'}, уровень: ${user.fitnessLevel || 'не указан'}, стаж: ${user.trainingExperienceYears || '?'} лет. Ограничения: ${user.healthRestrictions.map((h) => h.description).join(', ') || 'нет'}.`
      : '';

    const programContext = activeProgram
      ? `Активная программа: "${activeProgram.name}" (${activeProgram.type}, ${activeProgram.daysPerWeek} дней/нед).`
      : 'Активной программы нет.';

    // Save user message
    await prisma.chatMessage.create({
      data: { role: 'user', content: message, userId: req.userId! },
    });

    // Call Claude
    const anthropic = getAnthropicClient();
    const messages = history
      .reverse()
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    messages.push({ role: 'user', content: message });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `${SYSTEM_PROMPT}\n\n${userContext}\n${programContext}`,
      messages,
    });

    const aiContent = response.content[0].type === 'text' ? response.content[0].text : '';

    // Save AI response
    await prisma.chatMessage.create({
      data: { role: 'assistant', content: aiContent, userId: req.userId! },
    });

    res.json({ message: aiContent });
  } catch (e) {
    console.error('AI Chat error:', e);
    res.status(500).json({ error: 'Ошибка ИИ-ассистента' });
  }
});

// Analyze food photo
router.post('/analyze-food', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Изображение обязательно' });

    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
            },
            {
              type: 'text',
              text: `Проанализируй фото еды. Определи каждый продукт на фото, оцени примерный вес в граммах и рассчитай КБЖУ.

Ответь СТРОГО в формате JSON:
{
  "items": [
    {
      "name": "название продукта",
      "weightGrams": 150,
      "calories": 200,
      "protein": 30,
      "fats": 5,
      "carbs": 10
    }
  ]
}

Только JSON, без комментариев.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Не удалось распознать еду' });
    }

    const result = JSON.parse(jsonMatch[0]);
    res.json(result);
  } catch (e) {
    console.error('Food analysis error:', e);
    res.status(500).json({ error: 'Ошибка анализа фото' });
  }
});

// Get chat history
router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messages = await prisma.chatMessage.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    res.json(messages);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Ошибка получения истории чата' });
  }
});

export { router as aiRouter };
