require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mysql = require("mysql2/promise");
const crypto = require("crypto");
const { Resend } = require("resend");
const { body, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3000;

// Admin password from environment
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// Simple token generation and validation
const generateToken = () => crypto.randomBytes(32).toString("hex");
const adminTokens = new Set(); // In-memory token storage (consider Redis for production)

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

// Competition date for age calculation (May 1st, 2026)
const COMPETITION_DATE = new Date("2026-05-01");

// Helper function to check if nationality is Tunisian
const isTunisian = (nationality) => {
  if (!nationality) return false;
  const tunisianValues = ["tunisia", "tunisie", "tn", "tunisian"];
  return tunisianValues.includes(nationality.toLowerCase());
};

// Helper function to calculate age on competition date
const calculateAgeOnCompetition = (birthDate) => {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  let age = COMPETITION_DATE.getFullYear() - birth.getFullYear();
  const monthDiff = COMPETITION_DATE.getMonth() - birth.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && COMPETITION_DATE.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
};

// Calculate Etranger field
// - Single athlete: Tunisian = false, non-Tunisian = true
// - Pair: Both non-Tunisian = true, otherwise false
const calculateEtranger = (
  athlete1Nationality,
  athlete2Nationality,
  isPair,
) => {
  const athlete1IsTunisian = isTunisian(athlete1Nationality);

  if (!isPair) {
    // Single athlete
    return !athlete1IsTunisian;
  }

  // Pair
  const athlete2IsTunisian = isTunisian(athlete2Nationality);
  // Both non-Tunisian = true, otherwise false
  return !athlete1IsTunisian && !athlete2IsTunisian;
};

// Calculate Mosaique field
// True when:
// - Single athlete (no pair)
// - Male + Female
// - Female + Female
// - Young + Adult (young ≤20, adult >20)
// - 2 Young
// - 2 Adults of different nationalities
const calculateMosaique = (athlete1, athlete2, isPair) => {
  // Single athlete: always true
  if (!isPair) {
    return true;
  }

  const gender1 = athlete1.gender;
  const gender2 = athlete2.gender;

  // Male + Female: true
  if (
    (gender1 === "male" && gender2 === "female") ||
    (gender1 === "female" && gender2 === "male")
  ) {
    return true;
  }

  // Female + Female: true
  if (gender1 === "female" && gender2 === "female") {
    return true;
  }

  // Calculate ages
  const age1 = calculateAgeOnCompetition(athlete1.birthDate);
  const age2 = calculateAgeOnCompetition(athlete2.birthDate);

  if (age1 === null || age2 === null) {
    return false;
  }

  const isYoung1 = age1 <= 20;
  const isYoung2 = age2 <= 20;

  // Young + Adult: true
  if ((isYoung1 && !isYoung2) || (!isYoung1 && isYoung2)) {
    return true;
  }

  // 2 Young: true
  if (isYoung1 && isYoung2) {
    return true;
  }

  // 2 Adults of different nationalities: true
  if (!isYoung1 && !isYoung2) {
    const nat1 = (athlete1.nationality || "").toLowerCase();
    const nat2 = (athlete2.nationality || "").toLowerCase();
    if (nat1 !== nat2) {
      return true;
    }
  }

  // Otherwise: false (2 adult males of same nationality)
  return false;
};

// Calculate Mixte field
// True when:
// - Club1 different from Club2
// - One club is "Open" and the other is not
// False when: Both clubs are the same and not "Open"
const calculateMixte = (club1Name, club2Name, isPair) => {
  if (!isPair) {
    return false; // Single athlete cannot be mixte
  }

  // Normalize club names
  const club1 = (club1Name || "").toLowerCase().trim();
  const club2 = (club2Name || "").toLowerCase().trim();

  const isOpen1 = club1 === "open";
  const isOpen2 = club2 === "open";

  // Both are Open: false
  if (isOpen1 && isOpen2) {
    return false;
  }

  // One is Open and the other is not: true
  if (isOpen1 !== isOpen2) {
    return true;
  }

  // Both are not Open: check if different clubs
  // Different clubs: true, Same clubs: false
  return club1 !== club2;
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased limit for image upload

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Admin authentication middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  if (!adminTokens.has(token)) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  next();
};

// Admin login
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = generateToken();
    adminTokens.add(token);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: "Mot de passe incorrect" });
  }
});

// Admin logout
app.post("/api/admin/logout", authenticateAdmin, (req, res) => {
  const token = req.headers.authorization.split(" ")[1];
  adminTokens.delete(token);
  res.json({ success: true });
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

  const {
    athlete1,
    athlete2,
    isPair,
    locale,
    athlete1Photo,
    athlete1PhotoType,
    athlete2Photo,
    athlete2PhotoType,
  } = req.body;

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

    // Get club names for mixte calculation
    const getClubName = async (clubId) => {
      if (!clubId) return null;
      const [clubs] = await pool.query("SELECT name FROM clubs WHERE id = ?", [
        clubId,
      ]);
      return clubs.length > 0 ? clubs[0].name : null;
    };

    const athlete1ClubName = await getClubName(athlete1ClubId);
    const athlete2ClubName = isPair ? await getClubName(athlete2ClubId) : null;

    // Convert base64 images to Buffer if provided
    let athlete1PhotoBuffer = null;
    if (athlete1Photo) {
      const base64Data = athlete1Photo.replace(/^data:image\/\w+;base64,/, "");
      athlete1PhotoBuffer = Buffer.from(base64Data, "base64");
    }

    let athlete2PhotoBuffer = null;
    if (isPair && athlete2Photo) {
      const base64Data = athlete2Photo.replace(/^data:image\/\w+;base64,/, "");
      athlete2PhotoBuffer = Buffer.from(base64Data, "base64");
    }

    // Calculate the auto-fields
    const etranger = calculateEtranger(
      athlete1.nationality,
      isPair ? athlete2.nationality : null,
      isPair,
    );

    const mosaique = calculateMosaique(
      athlete1,
      isPair ? athlete2 : null,
      isPair,
    );

    const mixte = calculateMixte(athlete1ClubName, athlete2ClubName, isPair);

    const [result] = await pool.query(
      `INSERT INTO registrations (
        athlete1_last_name, athlete1_first_name, athlete1_birth_date,
        athlete1_club_id, athlete1_nationality, athlete1_gender,
        athlete1_email, athlete1_phone, athlete1_photo, athlete1_photo_type,
        is_pair,
        athlete2_last_name, athlete2_first_name, athlete2_birth_date,
        athlete2_club_id, athlete2_nationality, athlete2_gender,
        athlete2_email, athlete2_phone, athlete2_photo, athlete2_photo_type,
        locale, etranger, mosaique, mixte
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        athlete1.lastName,
        athlete1.firstName,
        athlete1.birthDate,
        athlete1ClubId,
        athlete1.nationality,
        athlete1.gender,
        athlete1.email,
        athlete1.phone,
        athlete1PhotoBuffer,
        athlete1PhotoType || null,
        isPair,
        isPair ? athlete2.lastName : null,
        isPair ? athlete2.firstName : null,
        isPair ? athlete2.birthDate : null,
        athlete2ClubId,
        isPair ? athlete2.nationality : null,
        isPair ? athlete2.gender : null,
        isPair ? athlete2.email : null,
        isPair ? athlete2.phone : null,
        athlete2PhotoBuffer,
        athlete2PhotoType || null,
        locale || "fr",
        etranger,
        mosaique,
        mixte,
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

// Get all registrations (admin endpoint - protected)
app.get("/api/admin/registrations", authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.id, r.registration_date,
             r.athlete1_last_name, r.athlete1_first_name, r.athlete1_birth_date,
             r.athlete1_club_id, r.athlete1_nationality, r.athlete1_gender,
             r.athlete1_email, r.athlete1_phone,
             r.athlete1_photo, r.athlete1_photo_type,
             r.is_pair,
             r.athlete2_last_name, r.athlete2_first_name, r.athlete2_birth_date,
             r.athlete2_club_id, r.athlete2_nationality, r.athlete2_gender,
             r.athlete2_email, r.athlete2_phone,
             r.athlete2_photo, r.athlete2_photo_type,
             r.locale, r.mixte, r.mosaique, r.etranger,
             c1.name as athlete1_club_name,
             c2.name as athlete2_club_name
      FROM registrations r
      LEFT JOIN clubs c1 ON r.athlete1_club_id = c1.id
      LEFT JOIN clubs c2 ON r.athlete2_club_id = c2.id
      ORDER BY r.registration_date DESC
    `);

    // Convert photo buffers to base64 for frontend display
    const rowsWithBase64 = rows.map((row) => ({
      ...row,
      athlete1_photo: row.athlete1_photo
        ? `data:${row.athlete1_photo_type || "image/jpeg"};base64,${row.athlete1_photo.toString("base64")}`
        : null,
      athlete2_photo: row.athlete2_photo
        ? `data:${row.athlete2_photo_type || "image/jpeg"};base64,${row.athlete2_photo.toString("base64")}`
        : null,
    }));

    res.json(rowsWithBase64);
  } catch (error) {
    console.error("Error fetching registrations:", error);
    res.status(500).json({ error: "Failed to fetch registrations" });
  }
});

// Recalculate auto-fields for all registrations (admin endpoint)
app.post(
  "/api/admin/recalculate-fields",
  authenticateAdmin,
  async (req, res) => {
    try {
      // Get all registrations that need recalculation (where fields are NULL)
      const [rows] = await pool.query(`
      SELECT r.id, r.athlete1_nationality, r.athlete1_gender, r.athlete1_birth_date,
             r.is_pair, r.athlete2_nationality, r.athlete2_gender, r.athlete2_birth_date,
             r.etranger, r.mosaique, r.mixte,
             c1.name as athlete1_club_name, c2.name as athlete2_club_name
      FROM registrations r
      LEFT JOIN clubs c1 ON r.athlete1_club_id = c1.id
      LEFT JOIN clubs c2 ON r.athlete2_club_id = c2.id
      WHERE r.etranger IS NULL OR r.mosaique IS NULL OR r.mixte IS NULL
    `);

      let updatedCount = 0;

      for (const row of rows) {
        const athlete1 = {
          nationality: row.athlete1_nationality,
          gender: row.athlete1_gender,
          birthDate: row.athlete1_birth_date,
        };

        const athlete2 = row.is_pair
          ? {
              nationality: row.athlete2_nationality,
              gender: row.athlete2_gender,
              birthDate: row.athlete2_birth_date,
            }
          : null;

        const etranger = calculateEtranger(
          athlete1.nationality,
          athlete2 ? athlete2.nationality : null,
          row.is_pair,
        );

        const mosaique = calculateMosaique(athlete1, athlete2, row.is_pair);

        const mixte = calculateMixte(
          row.athlete1_club_name,
          row.athlete2_club_name,
          row.is_pair,
        );

        await pool.query(
          `UPDATE registrations SET etranger = ?, mosaique = ?, mixte = ? WHERE id = ?`,
          [etranger, mosaique, mixte, row.id],
        );

        updatedCount++;
      }

      res.json({
        success: true,
        message: `Recalculated fields for ${updatedCount} registrations`,
        updatedCount,
      });
    } catch (error) {
      console.error("Error recalculating fields:", error);
      res.status(500).json({ error: "Failed to recalculate fields" });
    }
  },
);

// Force recalculate ALL registrations (admin endpoint)
app.post(
  "/api/admin/recalculate-all-fields",
  authenticateAdmin,
  async (req, res) => {
    try {
      // Get ALL registrations
      const [rows] = await pool.query(`
      SELECT r.id, r.athlete1_nationality, r.athlete1_gender, r.athlete1_birth_date,
             r.is_pair, r.athlete2_nationality, r.athlete2_gender, r.athlete2_birth_date,
             c1.name as athlete1_club_name, c2.name as athlete2_club_name
      FROM registrations r
      LEFT JOIN clubs c1 ON r.athlete1_club_id = c1.id
      LEFT JOIN clubs c2 ON r.athlete2_club_id = c2.id
    `);

      let updatedCount = 0;

      for (const row of rows) {
        const athlete1 = {
          nationality: row.athlete1_nationality,
          gender: row.athlete1_gender,
          birthDate: row.athlete1_birth_date,
        };

        const athlete2 = row.is_pair
          ? {
              nationality: row.athlete2_nationality,
              gender: row.athlete2_gender,
              birthDate: row.athlete2_birth_date,
            }
          : null;

        const etranger = calculateEtranger(
          athlete1.nationality,
          athlete2 ? athlete2.nationality : null,
          row.is_pair,
        );

        const mosaique = calculateMosaique(athlete1, athlete2, row.is_pair);

        const mixte = calculateMixte(
          row.athlete1_club_name,
          row.athlete2_club_name,
          row.is_pair,
        );

        await pool.query(
          `UPDATE registrations SET etranger = ?, mosaique = ?, mixte = ? WHERE id = ?`,
          [etranger, mosaique, mixte, row.id],
        );

        updatedCount++;
      }

      res.json({
        success: true,
        message: `Force recalculated fields for ${updatedCount} registrations`,
        updatedCount,
      });
    } catch (error) {
      console.error("Error recalculating all fields:", error);
      res.status(500).json({ error: "Failed to recalculate all fields" });
    }
  },
);

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
