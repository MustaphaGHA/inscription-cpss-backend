-- Initialize the database schema for MySQL

CREATE TABLE IF NOT EXISTS clubs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    -- Athlete 1
    athlete1_last_name VARCHAR(255) NOT NULL,
    athlete1_first_name VARCHAR(255) NOT NULL,
    athlete1_birth_date DATE NOT NULL,
    athlete1_club_id INT,
    athlete1_nationality VARCHAR(100) NOT NULL,
    athlete1_gender VARCHAR(10) NOT NULL,
    athlete1_email VARCHAR(255) NOT NULL,
    athlete1_phone VARCHAR(50) NOT NULL,
    
    -- Pair participation
    is_pair BOOLEAN DEFAULT FALSE,
    
    -- Athlete 2 (optional, only if is_pair is true)
    athlete2_last_name VARCHAR(255),
    athlete2_first_name VARCHAR(255),
    athlete2_birth_date DATE,
    athlete2_club_id INT,
    athlete2_nationality VARCHAR(100),
    athlete2_gender VARCHAR(10),
    athlete2_email VARCHAR(255),
    athlete2_phone VARCHAR(50),
    
    -- Metadata
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',
    locale VARCHAR(5) DEFAULT 'fr',
    team_photo LONGBLOB,
    team_photo_type VARCHAR(100),
    
    -- Foreign keys
    FOREIGN KEY (athlete1_club_id) REFERENCES clubs(id),
    FOREIGN KEY (athlete2_club_id) REFERENCES clubs(id)
);

-- Insert some default clubs
INSERT IGNORE INTO clubs (name) VALUES 
    ('Open'),
    ('CPSS - Club de Pêche Sportive de Sfax'),
    ('Fédération Tunisienne des Pêches Sportives'),
    ('Colmic Official Team'),
    ('Octo Fishing Equipment'),
    ('Albatros Sea Equipments');

-- Create indexes for better performance
CREATE INDEX idx_registrations_email ON registrations(athlete1_email);
CREATE INDEX idx_registrations_status ON registrations(status);
CREATE INDEX idx_registrations_date ON registrations(registration_date);

-- Check and add columns one by one
-- Run each statement separately

ALTER TABLE registrations ADD COLUMN mixte BOOLEAN DEFAULT NULL;
ALTER TABLE registrations ADD COLUMN mosaique BOOLEAN DEFAULT NULL;
ALTER TABLE registrations ADD COLUMN etranger BOOLEAN DEFAULT NULL;