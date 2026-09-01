import fetch from 'node-fetch';

const PLATEGA_SHOP_ID = process.env.PLATEGA_SHOP_ID;
const PLATEGA_SECRET_KEY = process.env.PLATEGA_SECRET_KEY;

export async function createPlategaInvoice(amountRub, description, payloadId) {
    if (!PLATEGA_SHOP_ID || !PLATEGA_SECRET_KEY) {
        throw new Error('Ключи PLATEGA_SHOP_ID или PLATEGA_SECRET_KEY не заданы в .env!');
    }

    const url = 'https://api.platega.com/v1/invoices';
    const body = {
        shop_id: PLATEGA_SHOP_ID,
        amount: amountRub,
        currency: 'RUB',
        description: description,
        payload: payloadId
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Secret-Key': PLATEGA_SECRET_KEY
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Platega API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const invoiceId = data.invoice_id || data.id;
    const payUrl = data.pay_url || data.url || data.paymentUrl;
    return {
        invoice_id: invoiceId,
        transactionId: invoiceId,
        pay_url: payUrl,
        redirect: payUrl,
        url: payUrl
    };
}

export async function checkPlategaInvoice(invoiceId) {
    if (!PLATEGA_SECRET_KEY) {
        throw new Error('PLATEGA_SECRET_KEY не задан в .env!');
    }

    const url = `https://api.platega.com/v1/invoices/${invoiceId}`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-Secret-Key': PLATEGA_SECRET_KEY
        }
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Platega Check Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const statusNormalized = String(data.status || '').toUpperCase();
    const isPaid = statusNormalized === 'PAID' || statusNormalized === 'COMPLETED' || statusNormalized === 'CONFIRMED' || statusNormalized === 'SUCCESS';
    return {
        status: isPaid ? 'CONFIRMED' : (statusNormalized === 'PENDING' ? 'PENDING' : statusNormalized),
        raw_status: data.status,
        is_paid: isPaid
    };
}
