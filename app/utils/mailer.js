const nodemailer = require("nodemailer");

function must(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: must("SMTP_USER"),
    pass: must("SMTP_PASS"),
  },
});

async function sendMail({ to, subject, text, html }) {
  if (!to) throw new Error("sendMail: missing 'to'");
  if (!subject) throw new Error("sendMail: missing 'subject'");
  if (!text && !html) throw new Error("sendMail: missing 'text' or 'html'");

  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });

  return info;
}

module.exports = {
  sendMail,
};
