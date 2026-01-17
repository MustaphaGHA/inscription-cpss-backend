require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mysql = require("mysql2/promise");
const { Resend } = require("resend");
const { body, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3000;

// Resend configuration
const resend = new Resend(process.env.RESEND_API_KEY);

// Email template for confirmation
const getConfirmationEmailHtml = (athlete, isPair, partner, locale) => {
  const isFrench = locale === "fr";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #1a2744; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1a2744; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background-color: #f5f5f5; padding: 30px; border-radius: 0 0 10px 10px; }
        .highlight { color: #c92536; font-weight: bold; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
        .info-box { background-color: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${isFrench ? "Confirmation d'inscription" : "Registration Confirmation"}</h1>
          <h2>Poisson d'Avril - 9ème Édition</h2>
        </div>
        <div class="content">
          <p>${isFrench ? "Cher(e)" : "Dear"} <strong>${athlete.firstName} ${athlete.lastName}</strong>,</p>
          
          <p>${
            isFrench
              ? "Nous avons le plaisir de vous confirmer que votre inscription au <span class='highlight'>9ème Trophée International de Surfcasting Poisson d'Avril</span> a été enregistrée avec succès."
              : "We are pleased to confirm that your registration for the <span class='highlight'>9th Poisson d'Avril International Surfcasting Trophy</span> has been successfully recorded."
          }</p>
          
          <div class="info-box">
            <h3>${isFrench ? "Détails de l'événement" : "Event Details"}</h3>
            <p>📅 <strong>${isFrench ? "Date" : "Date"}:</strong> 30 ${isFrench ? "Avril" : "April"} & 01 & 02 ${isFrench ? "Mai" : "May"} 2026</p>
            <p>📍 <strong>${isFrench ? "Lieu" : "Location"}:</strong> Hammamet-Sud, Bouficha, ${isFrench ? "Tunisie" : "Tunisia"}</p>
            <p>💰 <strong>${isFrench ? "Tarif" : "Price"}:</strong> 450DT / 140€</p>
          </div>
          
          ${
            isPair && partner
              ? `
            <div class="info-box">
              <h3>${isFrench ? "Votre partenaire" : "Your Partner"}</h3>
              <p><strong>${partner.firstName} ${partner.lastName}</strong></p>
            </div>
          `
              : ""
          }
          
          <p>${
            isFrench
              ? "Les tickets seront disponibles chez nos points de vente publiés sur notre page Facebook."
              : "Tickets will be available at our points of sale published on our Facebook page."
          }</p>
          
          <p>${
            isFrench
              ? "Pour toute question, n'hésitez pas à nous contacter via WhatsApp :"
              : "For any questions, feel free to contact us via WhatsApp:"
          }</p>
          <p>📱 Bouch: +216 97 475 628<br>📱 Walid: +216 54 157 440</p>
          
          <p>${isFrench ? "À très bientôt !" : "See you soon!"}</p>
          <p><strong>${isFrench ? "L'équipe CPSS" : "The CPSS Team"}</strong></p>
        </div>
        <div class="footer">
          <p>© 2026 CPSS - Club de Pêche Sportive de Sfax</p>
          <p>contact@cpss-poissondavril.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Function to send confirmation email
const sendConfirmationEmail = async (athlete, isPair, partner, locale) => {
  const isFrench = locale === "fr";

  try {
    const { data, error } = await resend.emails.send({
      from: "CPSS Poisson d Avril <noreply@cpss-poissondavril.com>",
      to: athlete.email,
      subject: isFrench
        ? "Confirmation d'inscription au Poisson d'Avril 9ème édition"
        : "Registration Confirmation - Poisson d'Avril 9th Edition",
      html: getConfirmationEmailHtml(athlete, isPair, partner, locale),
    });

    if (error) {
      console.error(`Failed to send email to ${athlete.email}:`, error);
    } else {
      console.log(`Confirmation email sent to ${athlete.email}`, data);
    }
  } catch (error) {
    console.error(`Failed to send email to ${athlete.email}:`, error);
    // Don't throw - we don't want to fail the registration if email fails
  }
};

// Database connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || "cpss",
  password: process.env.MYSQL_PASSWORD || "cpss_secure_password",
  database: process.env.MYSQL_DATABASE || "cpss_registration",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased limit for image upload

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Check if email already exists in registrations
app.get("/api/check-email", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM registrations 
       WHERE athlete1_email = ? OR athlete2_email = ?`,
      [email.toLowerCase(), email.toLowerCase()],
    );

    res.json({ exists: rows[0].count > 0 });
  } catch (error) {
    console.error("Error checking email:", error);
    res.status(500).json({ error: "Failed to check email" });
  }
});

// Check if phone already exists in registrations
app.get("/api/check-phone", async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    // Normalize phone number by removing spaces and special characters
    const normalizedPhone = phone.replace(/[\s\-\(\)]/g, "");

    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM registrations 
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(athlete1_phone, ' ', ''), '-', ''), '(', ''), ')', '') = ? 
       OR REPLACE(REPLACE(REPLACE(REPLACE(athlete2_phone, ' ', ''), '-', ''), '(', ''), ')', '') = ?`,
      [normalizedPhone, normalizedPhone],
    );

    res.json({ exists: rows[0].count > 0 });
  } catch (error) {
    console.error("Error checking phone:", error);
    res.status(500).json({ error: "Failed to check phone" });
  }
});

// Get all clubs (exclude hidden "Open" club)
app.get("/api/clubs", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name FROM clubs WHERE name != 'Open' ORDER BY name",
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching clubs:", error);
    res.status(500).json({ error: "Failed to fetch clubs" });
  }
});

// Add new club
app.post(
  "/api/clubs",
  body("name").trim().notEmpty().withMessage("Club name is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name } = req.body;
      // Check if club exists
      const [existing] = await pool.query(
        "SELECT id, name FROM clubs WHERE name = ?",
        [name],
      );
      if (existing.length > 0) {
        return res.status(201).json(existing[0]);
      }
      // Insert new club
      const [result] = await pool.query("INSERT INTO clubs (name) VALUES (?)", [
        name,
      ]);
      res.status(201).json({ id: result.insertId, name });
    } catch (error) {
      console.error("Error adding club:", error);
      res.status(500).json({ error: "Failed to add club" });
    }
  },
);

// Validation middleware for registration
const registrationValidation = [
  body("athlete1.lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required"),
  body("athlete1.firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required"),
  body("athlete1.birthDate")
    .isDate()
    .withMessage("Valid birth date is required"),
  body("athlete1.nationality")
    .trim()
    .notEmpty()
    .withMessage("Nationality is required"),
  body("athlete1.gender")
    .isIn(["male", "female"])
    .withMessage("Gender must be male or female"),
  body("athlete1.email").isEmail().withMessage("Valid email is required"),
  body("athlete1.phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required"),
  body("isPair").isBoolean(),
  body("athlete2.lastName").if(body("isPair").equals(true)).trim().notEmpty(),
  body("athlete2.firstName").if(body("isPair").equals(true)).trim().notEmpty(),
  body("athlete2.birthDate").if(body("isPair").equals(true)).isDate(),
  body("athlete2.nationality")
    .if(body("isPair").equals(true))
    .trim()
    .notEmpty(),
  body("athlete2.gender")
    .if(body("isPair").equals(true))
    .isIn(["male", "female"]),
  body("athlete2.email").if(body("isPair").equals(true)).isEmail(),
  body("athlete2.phone").if(body("isPair").equals(true)).trim().notEmpty(),
];

// Submit registration
app.post("/api/registrations", registrationValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { athlete1, athlete2, isPair, locale, teamPhoto, teamPhotoType } =
    req.body;

  try {
    // Helper function to get club ID - if "Open" string, find the Open club ID
    const getClubId = async (clubId) => {
      if (clubId === "Open") {
        const [openClub] = await pool.query(
          "SELECT id FROM clubs WHERE name = 'Open' LIMIT 1",
        );
        if (openClub.length > 0) {
          return openClub[0].id;
        }
        // If Open club doesn't exist, create it
        const [result] = await pool.query(
          "INSERT INTO clubs (name) VALUES ('Open')",
        );
        return result.insertId;
      }
      return clubId || null;
    };

    const athlete1ClubId = await getClubId(athlete1.clubId);
    const athlete2ClubId = isPair ? await getClubId(athlete2.clubId) : null;

    // Convert base64 image to Buffer if provided
    let photoBuffer = null;
    if (teamPhoto) {
      // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
      const base64Data = teamPhoto.replace(/^data:image\/\w+;base64,/, "");
      photoBuffer = Buffer.from(base64Data, "base64");
    }

    const [result] = await pool.query(
      `INSERT INTO registrations (
        athlete1_last_name, athlete1_first_name, athlete1_birth_date,
        athlete1_club_id, athlete1_nationality, athlete1_gender,
        athlete1_email, athlete1_phone,
        is_pair,
        athlete2_last_name, athlete2_first_name, athlete2_birth_date,
        athlete2_club_id, athlete2_nationality, athlete2_gender,
        athlete2_email, athlete2_phone,
        locale, team_photo, team_photo_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        athlete1.lastName,
        athlete1.firstName,
        athlete1.birthDate,
        athlete1ClubId,
        athlete1.nationality,
        athlete1.gender,
        athlete1.email,
        athlete1.phone,
        isPair,
        isPair ? athlete2.lastName : null,
        isPair ? athlete2.firstName : null,
        isPair ? athlete2.birthDate : null,
        athlete2ClubId,
        isPair ? athlete2.nationality : null,
        isPair ? athlete2.gender : null,
        isPair ? athlete2.email : null,
        isPair ? athlete2.phone : null,
        locale || "fr",
        photoBuffer,
        teamPhotoType || null,
      ],
    );

    res.status(201).json({
      success: true,
      registrationId: result.insertId,
      message: "Registration successful",
    });

    // Send confirmation emails (don't await - send in background)
    sendConfirmationEmail(
      athlete1,
      isPair,
      isPair ? athlete2 : null,
      locale || "fr",
    );

    // If pair, send email to athlete2 as well
    if (isPair && athlete2 && athlete2.email) {
      sendConfirmationEmail(athlete2, isPair, athlete1, locale || "fr");
    }
  } catch (error) {
    console.error("Error creating registration:", error);
    res.status(500).json({ error: "Failed to create registration" });
  }
});

// Get all registrations (admin endpoint)
app.get("/api/registrations", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, 
             c1.name as athlete1_club_name,
             c2.name as athlete2_club_name
      FROM registrations r
      LEFT JOIN clubs c1 ON r.athlete1_club_id = c1.id
      LEFT JOIN clubs c2 ON r.athlete2_club_id = c2.id
      ORDER BY r.registration_date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching registrations:", error);
    res.status(500).json({ error: "Failed to fetch registrations" });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
