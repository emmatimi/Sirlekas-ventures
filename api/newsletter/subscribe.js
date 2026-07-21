import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import nodemailer from 'nodemailer';

const require = createRequire(import.meta.url);
const { initializeAdmin } = require('../monnify/_payment-admin.cjs');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getTransporter() {
  const port = Number(process.env.SMTP_PORT || 587);
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('Newsletter email service is not configured');
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const website = String(req.body?.website || '').trim();
    if (website) return res.status(200).json({ subscribed: true });
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    const admin = initializeAdmin();
    const db = admin.firestore();
    const id = crypto.createHash('sha256').update(email).digest('hex');
    const subscriberRef = db.collection('newsletterSubscribers').doc(id);
    const existing = await subscriberRef.get();
    if (existing.exists && existing.data()?.status === 'active') {
      return res.status(200).json({ subscribed: true, alreadySubscribed: true });
    }

    await subscriberRef.set({
      email,
      status: 'pending',
      source: 'blog',
      createdAt: existing.exists ? existing.data()?.createdAt : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `Sirlekas Ventures <${from}>`,
      to: email,
      subject: 'Welcome to the Sirlekas newsletter',
      text: 'You are subscribed to the Sirlekas Ventures newsletter. You will receive study tips, academic guides, admission updates, and new learning resources.',
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a"><div style="background:#155eef;padding:24px;border-radius:16px 16px 0 0;color:white"><h1 style="margin:0;font-size:24px">Welcome to Sirlekas Ventures</h1></div><div style="padding:28px;border:1px solid #dbeafe;border-top:0;border-radius:0 0 16px 16px"><p style="font-size:16px;line-height:1.7">You're subscribed! We'll send you useful study tips, academic guides, admission updates, and new learning resources.</p><p style="color:#64748b;font-size:13px">You received this email because you subscribed on the Sirlekas blog.</p></div></div>`,
    });

    await subscriberRef.set({ status: 'active', confirmedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return res.status(201).json({ subscribed: true });
  } catch (error) {
    console.error('Newsletter subscription failed', error);
    return res.status(500).json({ error: 'Unable to subscribe right now. Please try again later.' });
  }
}
