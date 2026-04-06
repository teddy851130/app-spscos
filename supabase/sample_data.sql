-- SPS International 샘플 바이어 DB
-- 실행 방법: Supabase SQL 에디터에 복사 후 실행

-- GCC Tier 1 바이어 (실제 존재하는 회사)
INSERT INTO buyers (company_name, website, region, tier, contact_name, contact_title, contact_email, employee_count, est_revenue, k_beauty_flag, status) VALUES
('Alshaya Group', 'alshaya.com', 'GCC', 'Tier1', 'Sarah Al-Rashid', 'Beauty Category Director', 'sarah.alrashid@alshaya.com', 5000, '$3B+', 'N', 'Cold'),
('Chalhoub Group', 'chalhoubgroup.com', 'GCC', 'Tier1', 'Layla Hassan', 'Head of Beauty Buying', 'layla.hassan@chalhoubgroup.com', 12000, '$2B+', 'N', 'Cold'),
('Noon', 'noon.com', 'GCC', 'Tier1', 'Mohammed Al-Dosari', 'Beauty Category Manager', 'beauty@noon.com', 2000, '$500M+', 'Unknown', 'Cold'),
('Namshi', 'namshi.com', 'GCC', 'Tier1', 'Ahmad Al-Mansouri', 'Head of Beauty', 'ahmad@namshi.com', 500, '$100M+', 'Unknown', 'Cold'),
('Ounass', 'ounass.ae', 'GCC', 'Tier1', 'Fatima Al-Zahra', 'Beauty Buyer', 'fatima@ounass.ae', 200, '$50M+', 'Unknown', 'Cold'),
('Mikyajy', 'mikyajy.com', 'GCC', 'Tier1', 'Noor Al-Sayed', 'Buying Director', 'noor@mikyajy.com', 800, '$150M+', 'Unknown', 'Cold'),

-- GCC Tier 2 바이어
('Basharacare', 'basharacare.com', 'GCC', 'Tier2', 'Maya Berberi', 'Director of Partnerships', 'partnerships@basharacare.com', 15, '$5M-$10M', 'Y', 'Contacted'),
('Sephora Middle East', 'sephora.ae', 'GCC', 'Tier2', 'Aisha Al-Khatib', 'Sourcing Manager', 'aisha@sephora.ae', 300, '$40M+', 'Y', 'Replied'),
('Golden Scent', 'goldenscent.com', 'GCC', 'Tier2', 'Khalid Al-Otaibi', 'Head of Product', 'khalid@goldenscent.com', 100, '$20M+', 'Unknown', 'Cold'),
('Faces', 'faces.com', 'GCC', 'Tier2', 'Rania Mahmoud', 'Buying Manager', 'rania@faces.com', 200, '$30M+', 'N', 'Cold'),

-- USA Tier 1 바이어
('Ulta Beauty', 'ulta.com', 'USA', 'Tier1', 'Jennifer Park', 'VP of Merchandising', 'jennifer.park@ulta.com', 40000, '$8B+', 'Y', 'Cold'),
('Sephora US', 'sephora.com', 'USA', 'Tier1', 'Michelle Chen', 'Senior Beauty Buyer', 'michelle.chen@sephora.com', 35000, '$5B+', 'Y', 'Cold'),
('Target Beauty', 'target.com', 'USA', 'Tier1', 'Lisa Kim', 'Beauty Category Manager', 'lisa.kim@target.com', 400000, '$10B+', 'N', 'Cold'),
('Credo Beauty', 'credobeauty.com', 'USA', 'Tier1', 'Annie Jackson', 'Head of Buying', 'annie@credobeauty.com', 150, '$60M+', 'Unknown', 'Cold'),

-- USA Tier 2 바이어
('Glow Recipe', 'glowrecipe.com', 'USA', 'Tier2', 'Sarah Lee', 'Co-founder & CEO', 'sarah@glowrecipe.com', 80, '$30M+', 'Y', 'Cold'),
('Peach & Lily', 'peachandlily.com', 'USA', 'Tier2', 'Alicia Yoon', 'Founder & CEO', 'alicia@peachandlily.com', 60, '$20M+', 'Y', 'Interested'),
('BeautyMint', 'beautymint.com', 'USA', 'Tier2', 'Tom Rodriguez', 'Head of Sourcing', 'tom@beautymint.com', 70, '$15M+', 'Unknown', 'Cold'),
('Violet Grey', 'violetgrey.com', 'USA', 'Tier2', 'Emma Wilson', 'Buying Director', 'emma@violetgrey.com', 50, '$10M+', 'Unknown', 'Cold'),

-- Europe Tier 1 바이어
('Sephora Europe', 'sephora.fr', 'Europe', 'Tier1', 'Marie Dupont', 'Senior Buyer K-Beauty', 'marie.dupont@sephora.fr', 30000, '$4B+', 'Y', 'Replied'),
('Boots UK', 'boots.com', 'Europe', 'Tier1', 'Charlotte Smith', 'Beauty Category Manager', 'charlotte.smith@boots.com', 60000, '$7B+', 'N', 'Cold'),
('Douglas', 'douglas.de', 'Europe', 'Tier1', 'Anna Mueller', 'Head of Asian Beauty', 'anna.mueller@douglas.de', 20000, '$3B+', 'Y', 'Cold'),
('Feelunique', 'feelunique.com', 'Europe', 'Tier1', 'Sophie Martin', 'Buying Director', 'sophie.martin@feelunique.com', 500, '$80M+', 'Unknown', 'Cold'),

-- Europe Tier 2 바이어
('Cult Beauty', 'cultbeauty.co.uk', 'Europe', 'Tier2', 'Alexia Inge', 'Co-founder', 'alexia@cultbeauty.co.uk', 100, '$35M+', 'Y', 'Cold'),
('Content Beauty', 'contentbeauty.com', 'Europe', 'Tier2', 'Imelda Burke', 'Founder & Director', 'imelda@contentbeauty.com', 30, '$8M+', 'Unknown', 'Cold'),
('Naturkosmetik', 'naturkosmetik.de', 'Europe', 'Tier2', 'Klaus Weber', 'Einkaufsleiter', 'k.weber@naturkosmetik.de', 80, '$12M+', 'N', 'Cold'),
('Oh My Cream', 'ohmycream.com', 'Europe', 'Tier2', 'Juliette Levy', 'Directrice Achats', 'juliette@ohmycream.com', 50, '$10M+', 'Unknown', 'Cold');

-- 이메일 로그 샘플 데이터 (Replied/Interested 바이어만)
INSERT INTO email_logs (buyer_id, email_type, subject, body_en, status, sent_at, opened_at, replied_at, pipedrive_bcc_sent)
SELECT
  b.id,
  'initial',
  'Korean Beauty OEM Partnership — ' || b.company_name,
  'Dear ' || COALESCE(b.contact_name, 'there') || ',' || chr(10) || chr(10) || 'I came across ' || b.company_name || ' and wanted to reach out about a K-Beauty OEM opportunity.' || chr(10) || chr(10) || 'Best,' || chr(10) || 'Teddy Shin | SPS International',
  CASE b.status
    WHEN 'Replied' THEN 'replied'
    WHEN 'Interested' THEN 'replied'
    WHEN 'Contacted' THEN 'opened'
    ELSE 'sent'
  END,
  NOW() - INTERVAL '3 days',
  CASE WHEN b.status IN ('Contacted', 'Replied', 'Interested') THEN NOW() - INTERVAL '2 days' ELSE NULL END,
  CASE WHEN b.status IN ('Replied', 'Interested') THEN NOW() - INTERVAL '1 day' ELSE NULL END,
  true
FROM buyers b
WHERE b.status != 'Cold';
