import type { PrismaClient } from '@prisma/client';
import { Bot, InputFile, Keyboard, type Context } from 'grammy';
import type { SyrveClient, SyrveContext } from '../syrve/index.js';
import { cardQr, getCardView } from './card.js';
import { normalizePhone } from './phone.js';
import { PhoneTakenError, registerGuest } from './registration.js';

export interface BotDeps {
  token: string;
  prisma: PrismaClient;
  syrve: SyrveClient;
  /** Лінива резолюція організації/програми (О1) */
  resolveCtx: () => Promise<SyrveContext>;
}

const BTN_CARD = '💳 Моя картка';
const BTN_SHARE = '📱 Поділитися номером';

const menuKeyboard = new Keyboard().text(BTN_CARD).resized().persistent();
const contactKeyboard = new Keyboard().requestContact(BTN_SHARE).resized().oneTime();

export function createBot(deps: BotDeps): Bot {
  const { prisma, syrve } = deps;
  const bot = new Bot(deps.token);
  // telegramId → нормалізований телефон, чекаємо імʼя (стан губиться при рестарті — гість просто надішле контакт знову)
  const awaitingName = new Map<number, string>();
  // реєстрація в процесі: повторні повідомлення в цей час ігноруємо, щоб не плодити паралельні запити
  const registering = new Set<number>();

  const findGuest = (ctx: Context) =>
    ctx.from ? prisma.guest.findUnique({ where: { telegramId: BigInt(ctx.from.id) } }) : null;

  const askContact = (ctx: Context) =>
    ctx.reply('Вітаємо! Щоб отримати бонусну картку, поділіться номером телефону.', {
      reply_markup: contactKeyboard,
    });

  async function sendCard(ctx: Context) {
    const guest = await findGuest(ctx);
    if (!guest) return askContact(ctx);
    try {
      const view = await getCardView({ syrve, ctx: await deps.resolveCtx() }, guest);
      await ctx.replyWithPhoto(new InputFile(await cardQr(view.cardNumber), 'card.png'), {
        caption: view.caption,
        reply_markup: menuKeyboard,
      });
    } catch (e) {
      console.error('card error', e);
      await ctx.reply('Не вдалося отримати дані картки. Спробуйте трохи пізніше.', { reply_markup: menuKeyboard });
    }
  }

  bot.command('start', async (ctx) => {
    awaitingName.delete(ctx.from!.id);
    if (await findGuest(ctx)) return sendCard(ctx);
    return askContact(ctx);
  });

  bot.command('card', sendCard);
  bot.hears(BTN_CARD, sendCard);

  bot.on('message:contact', async (ctx) => {
    const contact = ctx.message.contact;
    if (contact.user_id !== ctx.from.id) {
      return ctx.reply('Будь ласка, поділіться саме своїм номером кнопкою нижче.', {
        reply_markup: contactKeyboard,
      });
    }
    if (await findGuest(ctx)) return sendCard(ctx);
    const phone = normalizePhone(contact.phone_number);
    if (!phone) {
      return ctx.reply('Наразі підтримуються лише українські номери (+380…).');
    }
    awaitingName.set(ctx.from.id, phone);
    return ctx.reply('Дякуємо! Як до вас звертатися? Напишіть ваше імʼя.', {
      reply_markup: { remove_keyboard: true },
    });
  });

  bot.on('message:text', async (ctx) => {
    if (registering.has(ctx.from.id)) {
      return ctx.reply('Картка ще створюється, зачекайте будь ласка ⏳');
    }
    const phone = awaitingName.get(ctx.from.id);
    if (!phone) {
      if (await findGuest(ctx)) return ctx.reply('Натисніть «Моя картка».', { reply_markup: menuKeyboard });
      return askContact(ctx);
    }
    const name = ctx.message.text.trim();
    if (name.length < 2 || name.length > 60 || name.startsWith('/')) {
      return ctx.reply('Введіть, будь ласка, імʼя (від 2 до 60 символів).');
    }
    registering.add(ctx.from.id);
    // клавіатури немає, поки триває створення
    await ctx.reply('Картка створюється, зачекайте будь ласка ⏳', { reply_markup: { remove_keyboard: true } });
    try {
      await registerGuest(
        { prisma, syrve, ctx: await deps.resolveCtx() },
        { telegramId: BigInt(ctx.from.id), phone, name },
      );
      awaitingName.delete(ctx.from.id);
      await ctx.reply(`Вітаємо, ${name}! Картку створено 🎉`);
      return sendCard(ctx);
    } catch (e) {
      if (e instanceof PhoneTakenError) {
        awaitingName.delete(ctx.from.id);
        return ctx.reply(e.message);
      }
      console.error('registration error', e);
      return ctx.reply('Не вдалося завершити реєстрацію. Надішліть імʼя ще раз, щоб спробувати знову.');
    } finally {
      registering.delete(ctx.from.id);
    }
  });

  bot.catch((err) => console.error('bot error', err.error));
  return bot;
}
