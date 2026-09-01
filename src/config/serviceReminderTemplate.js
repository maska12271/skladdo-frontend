// Default subject/body offered when the user schedules a reminder email after selling a recurring
// service (see SalesOrdersPage's post-create prompt). Same reasoning as config/emailExamples.js:
// deliberately NOT in the i18n locale files, because i18next reads `{{...}}` as interpolation and
// would render the literal recipient/sender tokens this text needs to carry through to the backend's
// EmailTemplateRenderer as empty.

const TEMPLATES = {
    en: {
        subject: (serviceName) => `Time for your next ${serviceName}?`,
        body: (serviceName) => `<p>Dear {{recipient.contactName}},</p>
<p>It's been a while since your last ${serviceName} with us. Would you like to book your next one?</p>
<p>Kind regards,<br>{{sender.fullName}}<br>{{company.name}}</p>`,
    },
    et: {
        subject: (serviceName) => `Aeg broneerida "${serviceName}"?`,
        body: (serviceName) => `<p>Tere {{recipient.contactName}},</p>
<p>Mõnda aega on möödas teie viimasest "${serviceName}" teenusest meie juures. Kas soovite broneerida järgmise aja?</p>
<p>Parimate soovidega,<br>{{sender.fullName}}<br>{{company.name}}</p>`,
    },
    ru: {
        subject: (serviceName) => `Пора снова воспользоваться услугой «${serviceName}»?`,
        body: (serviceName) => `<p>Здравствуйте, {{recipient.contactName}}!</p>
<p>С момента вашей последней услуги «${serviceName}» у нас прошло некоторое время. Хотите записаться снова?</p>
<p>С уважением,<br>{{sender.fullName}}<br>{{company.name}}</p>`,
    },
}

/** The default reminder subject/body for `serviceName` in `language`, falling back to English. */
export function serviceReminderTemplate(language, serviceName) {
    const tpl = TEMPLATES[String(language || '').slice(0, 2)] || TEMPLATES.en
    return { subject: tpl.subject(serviceName), body: tpl.body(serviceName) }
}
