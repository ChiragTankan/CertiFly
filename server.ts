import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Jimp, loadFont, HorizontalAlign, VerticalAlign } from "jimp";
import * as jimpFonts from "jimp/fonts";
import nodemailer from "nodemailer";

const app = express();
const PORT = 3000;

// Enable generous payload limit for base64 certificate background uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const CUSTOM_COLORS: Record<string, { r: number; g: number; b: number }> = {
  red: { r: 239, g: 68, b: 68 },      // Tailwind red-500 (#ef4444)
  blue: { r: 59, g: 130, b: 246 },    // Tailwind blue-500 (#3b82f6)
  gold: { r: 234, g: 179, b: 8 },     // Tailwind yellow-500 (#eab308)
  green: { r: 34, g: 197, b: 94 },    // Tailwind green-500 (#22c55e)
  purple: { r: 168, g: 85, b: 247 },  // Tailwind purple-500 (#a855f7)
  pink: { r: 236, g: 72, b: 153 },    // Tailwind pink-500 (#ec4899)
  orange: { r: 249, g: 115, b: 22 },  // Tailwind orange-500 (#f97316)
  teal: { r: 20, g: 184, b: 166 },    // Tailwind teal-500 (#14b8a6)
};

function applyCustomColor(
  backgroundImg: any,
  printedImg: any,
  targetColor: { r: number; g: number; b: number }
) {
  const width = backgroundImg.bitmap.width;
  const height = backgroundImg.bitmap.height;
  const bgData = backgroundImg.bitmap.data;
  const prData = printedImg.bitmap.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      const r_b = bgData[idx];
      const g_b = bgData[idx + 1];
      const b_b = bgData[idx + 2];
      
      const r_w = prData[idx];
      const g_w = prData[idx + 1];
      const b_w = prData[idx + 2];

      if (r_b !== r_w || g_b !== g_w || b_b !== b_w) {
        // Find the channel where background is smallest to get maximum dynamic range for alpha estimation
        let minChanIdx = 0; // 0 for R, 1 for G, 2 for B
        let minChanVal = r_b;
        if (g_b < minChanVal) {
          minChanVal = g_b;
          minChanIdx = 1;
        }
        if (b_b < minChanVal) {
          minChanVal = b_b;
          minChanIdx = 2;
        }

        let bgVal = minChanVal;
        let prVal = minChanIdx === 0 ? r_w : (minChanIdx === 1 ? g_w : b_w);

        let alpha = 0;
        const denom = 255 - bgVal;
        if (denom > 0) {
          alpha = Math.max(0, Math.min(1, (prVal - bgVal) / denom));
        }

        // If alpha is extremely small but there was a change, fallback to a small general alpha
        if (alpha <= 0.01) {
          const diffR = Math.abs(r_w - r_b);
          const diffG = Math.abs(g_w - g_b);
          const diffB = Math.abs(b_w - b_b);
          alpha = Math.max(diffR, diffG, diffB) / 255;
        }

        prData[idx] = Math.round(alpha * targetColor.r + (1 - alpha) * r_b);
        prData[idx + 1] = Math.round(alpha * targetColor.g + (1 - alpha) * g_b);
        prData[idx + 2] = Math.round(alpha * targetColor.b + (1 - alpha) * b_b);
      }
    }
  }
}

  // Helper function to load correct font from Jimp v1 safely
  async function loadBestFont(fontSize: number, fontColor: "black" | "white" = "black") {
    let size = 32;
    if (fontSize <= 8) size = 8;
    else if (fontSize <= 10) size = 10;
    else if (fontSize <= 12) size = 12;
    else if (fontSize <= 14) size = 14;
    else if (fontSize <= 20) size = 16;
    else if (fontSize <= 48) size = 32;
    else if (fontSize <= 96) size = 64;
    else size = 128;

    // Handle white font variations since white has fewer sizes (8, 16, 32, 64, 128)
    if (fontColor === "white") {
      if (size === 10 || size === 12 || size === 14) {
        size = 16; // nearest white size
      }
    }

    const key = `SANS_${size}_${fontColor.toUpperCase()}` as keyof typeof jimpFonts;
    const fontToLoad = jimpFonts[key] || jimpFonts.SANS_32_BLACK;

    try {
      // First attempt: try loading from local bundle files (best for local/offline dev)
      return await loadFont(fontToLoad);
    } catch (e: any) {
      console.warn(`Local font loading failed (${e.message || e}), attempting Vercel-optimized CDN fallback...`);
      const cdnUrl = `https://unpkg.com/@jimp/plugin-print/fonts/open-sans/open-sans-${size}-${fontColor}/open-sans-${size}-${fontColor}.fnt`;
      try {
        return await loadFont(cdnUrl);
      } catch (cdnErr: any) {
        console.error(`Font CDN loading failed for size ${size} ${fontColor}:`, cdnErr.message || cdnErr);
        // Secondary fallback to reliable 32px black font over CDN
        try {
          return await loadFont("https://unpkg.com/@jimp/plugin-print/fonts/open-sans/open-sans-32-black/open-sans-32-black.fnt");
        } catch (finalErr: any) {
          throw new Error("Unable to locate certificate fonts either locally or over secure CDN fallbacks: " + finalErr.message);
        }
      }
    }
  }

  // API endpoint for campaigning dispatch (Streamed progress via SSE)
  app.post("/api/send-campaign", async (req, res) => {
    // Set headers for Server-Sent Events / Chunked Streaming
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const writeEvent = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const {
        subject,
        body,
        isCertificateEnabled,
        certificateImageUrl, // can be a raw base64 data url
        certCoords, // { x, y, fontSize, fontColor }
        recipients, // Array of { id, name, email }
        smtpConfig // Optional { host, port, secure, user, pass, fromName, fromEmail }
      } = req.body;

      if (!subject || !body || !recipients || !Array.isArray(recipients)) {
        writeEvent({ error: "Missing campaign configuration parameters." });
        res.end();
        return;
      }

      writeEvent({ status: "initializing", message: "Preparing campaign dispatch..." });

      // Prepare transporter
      let transporter: nodemailer.Transporter | null = null;
      let isSandbox = true;

      // Extract SMTP details from either manual override or server-side environment variables
      const smtpHost = smtpConfig?.host || process.env.SMTP_HOST;
      const smtpPort = Number(smtpConfig?.port || process.env.SMTP_PORT) || 587;
      const smtpSecure = smtpConfig?.secure !== undefined ? smtpConfig.secure : (process.env.SMTP_SECURE === "true" || smtpPort === 465);
      const smtpUser = smtpConfig?.user || process.env.SMTP_USER;
      const smtpPass = smtpConfig?.pass || process.env.SMTP_PASS;
      const smtpFromName = smtpConfig?.fromName || process.env.SMTP_FROM_NAME || "Event Organizer";
      const smtpFromEmail = smtpConfig?.fromEmail || process.env.SMTP_FROM_EMAIL || smtpUser;

      if (smtpHost && smtpUser && smtpPass) {
        isSandbox = false;
        try {
          transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          });
          writeEvent({ status: "smtp-verified", message: `SMTP verified (${smtpHost}). Dispatching emails...` });
        } catch (transportErr: any) {
          writeEvent({ error: `SMTP Connection failed: ${transportErr.message}` });
          res.end();
          return;
        }
      } else {
        // Fallback or dry-run, but we let the user know SMTP is missing
        writeEvent({
          status: "smtp-missing",
          message: "Ready to dispatch, but SMTP environment variables are not yet configured on your server."
        });
      }

      // Load base design image if certificate is enabled
      let baseImage: any | null = null;
      if (isCertificateEnabled && certificateImageUrl) {
        writeEvent({ status: "loading-template", message: "Decoding and loading certificate template..." });
        try {
          // Parse base64 data url
          const matches = certificateImageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          let imageBuffer: Buffer;
          if (matches && matches.length === 3) {
            imageBuffer = Buffer.from(matches[2], "base64");
          } else {
            imageBuffer = Buffer.from(certificateImageUrl, "base64");
          }
          baseImage = await Jimp.read(imageBuffer);
          writeEvent({ status: "template-loaded", message: "Certificate template loaded successfully." });
        } catch (imageErr: any) {
          writeEvent({ error: `Failed to load certificate design image: ${imageErr.message}` });
          res.end();
          return;
        }
      }

      // Loop over every recipient
      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        const { id, name, email } = recipient;

        // Validation filter
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          writeEvent({
            index: i,
            recipientId: id,
            status: "failed",
            message: `Skipped: Invalid email format (${email || "empty"})`
          });
          continue;
        }

        try {
          // Customize text template variables
          const personalizedBody = body.replace(/\{\{\s*name\s*\}\}/gi, name);

          // Customize certificate if active
          let finalAttachedCertBuffer: Buffer | null = null;
          if (isCertificateEnabled && baseImage) {
            // Clone template image so each participant gets a fresh independent copy
            const singleCert = baseImage.clone();

            const x = Number(certCoords?.x) || 100;
            const y = Number(certCoords?.y) || 100;
            const size = Number(certCoords?.fontSize) || 32;
            const originalColor = certCoords?.fontColor || "black";
            const isCustomColor = CUSTOM_COLORS[originalColor.toLowerCase()] !== undefined;
            const fontColorToLoad = isCustomColor ? "white" : originalColor;

            const loadedFont = await loadBestFont(size, fontColorToLoad as "white" | "black");
            
            // Print name on certificate
            // Print centered on X if possible or just normal print
            if (isCustomColor) {
              const bgClone = singleCert.clone();
              singleCert.print({
                font: loadedFont,
                x: x,
                y: y,
                text: {
                  text: name,
                  alignmentX: HorizontalAlign.LEFT,
                  alignmentY: VerticalAlign.MIDDLE
                }
              });
              applyCustomColor(bgClone, singleCert, CUSTOM_COLORS[originalColor.toLowerCase()]);
            } else {
              singleCert.print({
                font: loadedFont,
                x: x,
                y: y,
                text: {
                  text: name,
                  alignmentX: HorizontalAlign.LEFT,
                  alignmentY: VerticalAlign.MIDDLE
                }
              });
            }

            finalAttachedCertBuffer = await singleCert.getBuffer("image/png");
          }

          if (isSandbox) {
            // Simulate processing latency in Sandbox mode
            await new Promise((resolve) => setTimeout(resolve, 600));
            writeEvent({
              index: i,
              recipientId: id,
              status: "sent",
              message: `[Sandbox] Email simulated successfully to ${name} (${email})`
            });
          } else if (transporter) {
            const mailOptions: nodemailer.SendMailOptions = {
              from: `"${smtpFromName}" <${smtpFromEmail}>`,
              to: email,
              subject: subject.replace(/\{\{\s*name\s*\}\}/gi, name),
              html: personalizedBody.replace(/\n/g, "<br/>")
            };

            if (finalAttachedCertBuffer) {
              mailOptions.attachments = [
                {
                  filename: `${name.replace(/[^a-zA-Z0-9]/g, "_")}_Certificate.png`,
                  content: finalAttachedCertBuffer
                }
              ];
            }

            await transporter.sendMail(mailOptions);

            writeEvent({
              index: i,
              recipientId: id,
              status: "sent",
              message: `Personalized email sent to ${name} (${email})`
            });
          }
        } catch (dispatchErr: any) {
          writeEvent({
            index: i,
            recipientId: id,
            status: "failed",
            message: `Dispatch failed: ${dispatchErr.message}`
          });
        }
      }

      writeEvent({ status: "completed", message: "Bulk sending process finalized." });
    } catch (routeErr: any) {
      writeEvent({ error: `Internal Server Error: ${routeErr.message}` });
    } finally {
      res.end();
    }
  });

  // API endpoint for individual recipient dispatch (High-compatibility serverless-safe JSON endpoint)
  app.post("/api/send-single", async (req, res) => {
    try {
      const {
        subject,
        body,
        isCertificateEnabled,
        certificateImageUrl, // data url
        certCoords, // { x, y, fontSize, fontColor }
        recipient, // { id, name, email }
        smtpConfig
      } = req.body;

      if (!subject || !body || !recipient) {
        return res.status(400).json({ error: "Missing required dispatcher parameters." });
      }

      const { name, email } = recipient;
      if (!email) {
        return res.status(400).json({ error: "Candidate email is empty or invalid." });
      }

      // Initialize Mail Transporter
      let transporter: nodemailer.Transporter | null = null;
      let isSandbox = true;

      const smtpHost = smtpConfig?.host || process.env.SMTP_HOST;
      const smtpPort = Number(smtpConfig?.port || process.env.SMTP_PORT) || 587;
      const smtpSecure = smtpConfig?.secure !== undefined ? smtpConfig.secure : (process.env.SMTP_SECURE === "true" || smtpPort === 465);
      const smtpUser = smtpConfig?.user || process.env.SMTP_USER;
      const smtpPass = smtpConfig?.pass || process.env.SMTP_PASS;
      const smtpFromName = smtpConfig?.fromName || process.env.SMTP_FROM_NAME || "Event Organizer";
      const smtpFromEmail = smtpConfig?.fromEmail || process.env.SMTP_FROM_EMAIL || smtpUser;

      if (smtpHost && smtpUser && smtpPass) {
        isSandbox = false;
        try {
          transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          });
        } catch (smtpErr: any) {
          return res.status(400).json({ error: `SMTP construction failed: ${smtpErr.message}` });
        }
      }

      // Customize text template variables
      const personalizedBody = body.replace(/\{\{\s*name\s*\}\}/gi, name);
      const personalizedSubject = subject.replace(/\{\{\s*name\s*\}\}/gi, name);

      // Generate Certificate image if enabled
      let finalAttachedCertBuffer: Buffer | null = null;
      if (isCertificateEnabled && certificateImageUrl) {
        try {
          const matches = certificateImageUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          let imageBuffer: Buffer;
          if (matches && matches.length === 3) {
            imageBuffer = Buffer.from(matches[2], "base64");
          } else {
            imageBuffer = Buffer.from(certificateImageUrl, "base64");
          }
          const baseImage = await Jimp.read(imageBuffer);

          const x = Number(certCoords?.x) || 100;
          const y = Number(certCoords?.y) || 100;
          const size = Number(certCoords?.fontSize) || 32;
          const originalColor = certCoords?.fontColor || "black";
          const isCustomColor = CUSTOM_COLORS[originalColor.toLowerCase()] !== undefined;
          const fontColorToLoad = isCustomColor ? "white" : originalColor;

          const loadedFont = await loadBestFont(size, fontColorToLoad as "white" | "black");
          
          if (isCustomColor) {
            const bgClone = baseImage.clone();
            baseImage.print({
              font: loadedFont,
              x: x,
              y: y,
              text: {
                text: name,
                alignmentX: HorizontalAlign.LEFT,
                alignmentY: VerticalAlign.MIDDLE
              }
            });
            applyCustomColor(bgClone, baseImage, CUSTOM_COLORS[originalColor.toLowerCase()]);
          } else {
            baseImage.print({
              font: loadedFont,
              x: x,
              y: y,
              text: {
                text: name,
                alignmentX: HorizontalAlign.LEFT,
                alignmentY: VerticalAlign.MIDDLE
              }
            });
          }

          finalAttachedCertBuffer = await baseImage.getBuffer("image/png");
        } catch (certErr: any) {
          return res.status(500).json({ error: `Failed to construct personalization certificate: ${certErr.message}` });
        }
      }

      // Mail Transmission Sequence
      if (isSandbox) {
        return res.json({
          status: "sent",
          message: `[Sandbox Mode] Email simulated successfully to ${name} (${email})`
        });
      } else if (transporter) {
        const mailOptions: nodemailer.SendMailOptions = {
          from: `"${smtpFromName}" <${smtpFromEmail}>`,
          to: email,
          subject: personalizedSubject,
          html: personalizedBody.replace(/\n/g, "<br/>")
        };

        if (finalAttachedCertBuffer) {
          mailOptions.attachments = [
            {
              filename: `${name.replace(/[^a-zA-Z0-9]/g, "_")}_Certificate.png`,
              content: finalAttachedCertBuffer
            }
          ];
        }

        await transporter.sendMail(mailOptions);
        return res.json({
          status: "sent",
          message: `Email broadcast dispatched to ${name} (${email})`
        });
      } else {
        return res.status(400).json({
          error: "SMTP details missing on the server. Please check your credentials."
        });
      }
    } catch (routeErr: any) {
      console.error("Single email error details:", routeErr);
      return res.status(500).json({ error: routeErr.message || "Internal Service Dispatch Failure" });
    }
  });

  // Serve static assets in production, hook up Vite dev server in development
  async function bootstrap() {
    if (process.env.VERCEL === "1") {
      // Under Vercel, serverless function works directly; no port listening or Static serving here
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`[Campaign Server] listening running on http://0.0.0.0:${PORT}`);
    });
  }

  bootstrap().catch((err) => {
    console.error("Failed to start Full-Stack Server: ", err);
  });

export default app;
