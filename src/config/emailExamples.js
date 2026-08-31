// Starter email templates offered on the templates page, so a company's first template is something to
// adapt rather than a blank editor. Nothing here is ever saved automatically - picking one only prefills
// the create form.
//
// **Deliberately not in the i18n locale files.** i18next reads `{{...}}` as an interpolation placeholder
// and renders an unknown one as empty, which is exactly the syntax an example template is made of - the
// tokens would silently vanish from the very text meant to teach them. Same reason `config/plans.js`
// keeps its shared data here.
//
// Each body is the HTML the rich-text editor produces: simple <p> blocks, no styling. The tokens must
// match EmailTemplateRenderer's whitelist on the backend (see TOKENS in components/EmailTokensHelp.jsx).

/** The token that opens a greeting: the named contact when one was picked, the partner otherwise. */
const GREETING = {
    en: '{{recipient.contactName}}',
    et: '{{recipient.contactName}}',
    ru: '{{recipient.contactName}}',
}

const en = [
    {
        id: 'rfq',
        name: 'Request for quotation',
        subject: 'Request for quotation — {{company.name}}',
        body: `<p>Dear ${GREETING.en},</p>
<p>We are sourcing supply for the coming season and would like to request a quotation from {{recipient.name}}.</p>
<p>Could you send us your current pricing, minimum order quantities and lead times? If you have a product catalogue available, we would be glad to receive that as well.</p>
<p>Thank you in advance — we look forward to hearing from you.</p>`,
    },
    {
        id: 'quote-follow-up',
        name: 'Follow-up on a quotation',
        subject: 'Following up on our quotation',
        body: `<p>Dear ${GREETING.en},</p>
<p>I wanted to follow up on the quotation we sent {{recipient.name}} recently, in case it did not reach the right person.</p>
<p>If anything in it needs adjusting — quantities, delivery dates, payment terms — just reply to this email and we will revise it.</p>
<p>Kind regards,<br>{{sender.fullName}}</p>`,
    },
    {
        id: 'order-confirmation',
        name: 'Order confirmation',
        subject: 'Your order with {{company.name}} is confirmed',
        body: `<p>Dear ${GREETING.en},</p>
<p>Thank you for your order. We have confirmed it today, {{today}}, and it is now being prepared.</p>
<p>We will let you know as soon as it ships. If you need to change anything before then, reply to this email and we will take care of it.</p>
<p>Kind regards,<br>{{sender.fullName}}<br>{{company.name}}</p>`,
    },
    {
        id: 'price-list',
        name: 'Price list request',
        subject: 'Current price list request',
        body: `<p>Dear ${GREETING.en},</p>
<p>We are updating our purchasing plan and would like the current price list for {{recipient.name}}.</p>
<p>Please send the version valid from {{today}}, along with any volume discounts that apply.</p>
<p>Thank you,<br>{{sender.fullName}}</p>`,
    },
]

const et = [
    {
        id: 'rfq',
        name: 'Hinnapäring',
        subject: 'Hinnapäring — {{company.name}}',
        body: `<p>Tere ${GREETING.et},</p>
<p>Otsime tarnijaid eelseisvaks hooajaks ja soovime küsida hinnapakkumist ettevõttelt {{recipient.name}}.</p>
<p>Kas saaksite saata oma praegused hinnad, minimaalsed tellimuskogused ja tarneajad? Kui teil on tootekataloog, võtaksime hea meelega ka selle vastu.</p>
<p>Ette tänades ja head koostööd lootes.</p>`,
    },
    {
        id: 'quote-follow-up',
        name: 'Pakkumise meeldetuletus',
        subject: 'Meie hinnapakkumise kohta',
        body: `<p>Tere ${GREETING.et},</p>
<p>Soovisin täpsustada, kas meie hiljutine pakkumine ettevõttele {{recipient.name}} jõudis õige inimeseni.</p>
<p>Kui midagi vajab muutmist — kogused, tarnetähtajad, maksetingimused — vastake sellele kirjale ja teeme parandused.</p>
<p>Parimate soovidega,<br>{{sender.fullName}}</p>`,
    },
    {
        id: 'order-confirmation',
        name: 'Tellimuse kinnitus',
        subject: 'Teie tellimus ettevõttes {{company.name}} on kinnitatud',
        body: `<p>Tere ${GREETING.et},</p>
<p>Täname tellimuse eest. Kinnitasime selle täna, {{today}}, ja tellimus on ettevalmistamisel.</p>
<p>Anname teada kohe, kui kaup teele läheb. Kui soovite enne seda midagi muuta, vastake sellele kirjale ja korraldame ära.</p>
<p>Parimate soovidega,<br>{{sender.fullName}}<br>{{company.name}}</p>`,
    },
    {
        id: 'price-list',
        name: 'Hinnakirja päring',
        subject: 'Kehtiva hinnakirja päring',
        body: `<p>Tere ${GREETING.et},</p>
<p>Uuendame oma ostuplaani ja sooviksime saada ettevõtte {{recipient.name}} kehtivat hinnakirja.</p>
<p>Palun saatke versioon, mis kehtib alates {{today}}, koos kohalduvate koguselisandustega.</p>
<p>Tänades,<br>{{sender.fullName}}</p>`,
    },
]

const ru = [
    {
        id: 'rfq',
        name: 'Запрос коммерческого предложения',
        subject: 'Запрос коммерческого предложения — {{company.name}}',
        body: `<p>Здравствуйте, ${GREETING.ru}!</p>
<p>Мы подбираем поставщиков на предстоящий сезон и хотели бы запросить коммерческое предложение у компании {{recipient.name}}.</p>
<p>Пришлите, пожалуйста, актуальные цены, минимальные объёмы заказа и сроки поставки. Если у вас есть каталог продукции, будем рады получить и его.</p>
<p>Заранее благодарим и надеемся на сотрудничество.</p>`,
    },
    {
        id: 'quote-follow-up',
        name: 'Напоминание о предложении',
        subject: 'По поводу нашего коммерческого предложения',
        body: `<p>Здравствуйте, ${GREETING.ru}!</p>
<p>Хотел уточнить, дошло ли до нужного человека наше недавнее предложение для компании {{recipient.name}}.</p>
<p>Если что-то нужно изменить — объёмы, сроки поставки, условия оплаты — ответьте на это письмо, и мы внесём правки.</p>
<p>С уважением,<br>{{sender.fullName}}</p>`,
    },
    {
        id: 'order-confirmation',
        name: 'Подтверждение заказа',
        subject: 'Ваш заказ в {{company.name}} подтверждён',
        body: `<p>Здравствуйте, ${GREETING.ru}!</p>
<p>Благодарим за заказ. Сегодня, {{today}}, мы его подтвердили, и он готовится к отправке.</p>
<p>Сообщим, как только заказ будет отправлен. Если до этого нужно что-то изменить, ответьте на это письмо — всё сделаем.</p>
<p>С уважением,<br>{{sender.fullName}}<br>{{company.name}}</p>`,
    },
    {
        id: 'price-list',
        name: 'Запрос прайс-листа',
        subject: 'Запрос действующего прайс-листа',
        body: `<p>Здравствуйте, ${GREETING.ru}!</p>
<p>Мы обновляем план закупок и хотели бы получить действующий прайс-лист компании {{recipient.name}}.</p>
<p>Пришлите, пожалуйста, версию, действующую с {{today}}, вместе с применимыми скидками за объём.</p>
<p>Благодарим,<br>{{sender.fullName}}</p>`,
    },
]

const BY_LANGUAGE = { en, et, ru }

/**
 * The starter templates in {@code language}, falling back to English for anything else - the same
 * fallback i18next itself uses.
 */
export function emailExamples(language) {
    return BY_LANGUAGE[String(language || '').slice(0, 2)] || en
}
