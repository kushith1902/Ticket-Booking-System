const nodemailer = require('nodemailer');

let transporter;

async function getTransporter() {
    if (!transporter) {
        // Create an Ethereal test account automatically if no live credentials provided
        try {
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });
            console.log('Nodemailer test SMTP initialized using Ethereal Account:', testAccount.user);
        } catch (err) {
            console.warn('Could not initialize Ethereal test account. Falling back to log transport:', err.message);
            transporter = {
                sendMail: async (mailOptions) => {
                    console.log('--- EMAIL SENT (MOCK TRANSPORT) ---');
                    console.log(`To: ${mailOptions.to}`);
                    console.log(`Subject: ${mailOptions.subject}`);
                    console.log(`Body: ${mailOptions.text || mailOptions.html}`);
                    console.log('-----------------------------------');
                    return { messageId: 'mock-id-' + Date.now() };
                }
            };
        }
    }
    return transporter;
}

async function sendBookingConfirmationEmail({ userEmail, userName, bookingRef, eventTitle, venueName, startDate, seats, totalAmount, qrDataUrl }) {
    try {
        const mailer = await getTransporter();
        const info = await mailer.sendMail({
            from: process.env.EMAIL_FROM || '"TicketFlow" <no-reply@ticketflow.com>',
            to: userEmail,
            subject: `🎟 Booking Confirmed: ${eventTitle} (${bookingRef})`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #0f172a; color: #f8fafc;">
                    <h2 style="color: #38bdf8; text-align: center;">TicketFlow Booking Confirmation</h2>
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>Your tickets for <strong>${eventTitle}</strong> are confirmed!</p>

                    <div style="background: #1e293b; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <p style="margin: 5px 0;"><strong>Booking Reference:</strong> <span style="color: #f59e0b; font-weight: bold;">${bookingRef}</span></p>
                        <p style="margin: 5px 0;"><strong>Venue:</strong> ${venueName}</p>
                        <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${startDate}</p>
                        <p style="margin: 5px 0;"><strong>Seats:</strong> ${seats.join(', ')}</p>
                        <p style="margin: 5px 0;"><strong>Total Paid:</strong> ₹${totalAmount.toLocaleString('en-IN')}</p>
                    </div>

                    ${qrDataUrl ? `
                        <div style="text-align: center; margin: 20px 0;">
                            <p>Present this QR code at the venue gate for entry:</p>
                            <img src="${qrDataUrl}" alt="Ticket QR Code" style="width: 180px; height: 180px; border: 4px solid #38bdf8; border-radius: 8px;" />
                        </div>
                    ` : ''}

                    <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 30px;">
                        Thank you for booking with TicketFlow. Enjoy the event!
                    </p>
                </div>
            `
        });

        if (nodemailer.getTestMessageUrl && info.messageId && info.messageId.indexOf('mock-id') === -1) {
            console.log('Preview Email URL:', nodemailer.getTestMessageUrl(info));
        }
    } catch (err) {
        console.error('Failed to send confirmation email:', err.message);
    }
}

async function sendWaitlistOfferEmail({ userEmail, userName, eventTitle, category, seatLabel, claimUrl, expiresAt }) {
    try {
        const mailer = await getTransporter();
        const info = await mailer.sendMail({
            from: process.env.EMAIL_FROM || '"TicketFlow" <no-reply@ticketflow.com>',
            to: userEmail,
            subject: `⚡ TICKET AVAILABLE: ${eventTitle} (${category})`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #0f172a; color: #f8fafc;">
                    <h2 style="color: #f59e0b; text-align: center;">🎟 Waitlist Ticket Offer!</h2>
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>A <strong>${category}</strong> seat (<strong>${seatLabel}</strong>) has just become available for <strong>${eventTitle}</strong>!</p>

                    <div style="background: #1e293b; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                        <p style="margin: 5px 0;"><strong>Time Remaining:</strong> You have until <strong>${expiresAt}</strong> to claim this seat before it passes to the next customer in queue.</p>
                    </div>

                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${claimUrl}" style="background: #f59e0b; color: #000; padding: 12px 28px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block;">CLAIM TICKET NOW</a>
                    </div>
                </div>
            `
        });
        if (nodemailer.getTestMessageUrl && info.messageId && info.messageId.indexOf('mock-id') === -1) {
            console.log('Preview Waitlist Email URL:', nodemailer.getTestMessageUrl(info));
        }
    } catch (err) {
        console.error('Failed to send waitlist email:', err.message);
    }
}

module.exports = {
    sendBookingConfirmationEmail,
    sendWaitlistOfferEmail
};
