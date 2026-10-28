CREATE TABLE applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  full_name TEXT NOT NULL,
  reg_number TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  status TEXT DEFAULT 'pending'
);

-- Enable Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (since it's a public form)
CREATE POLICY "Allow public insert" ON applications
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow service role to read/write (used by backend)
CREATE POLICY "Service Role Access" ON applications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
-- STK callbacks are written only by the server using the service role key.
CREATE TABLE IF NOT EXISTS mpesa_stk_callbacks (
  checkout_request_id TEXT PRIMARY KEY,
  merchant_request_id TEXT,
  result_code INTEGER NOT NULL,
  result_description TEXT,
  amount NUMERIC,
  mpesa_receipt_number TEXT,
  phone_number TEXT,
  transaction_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mpesa_stk_callbacks ENABLE ROW LEVEL SECURITY;
