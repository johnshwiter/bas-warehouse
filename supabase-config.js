// Supabase connection (the publishable key is meant to be public; security is in the database rules)
const SUPABASE_URL = "https://ksbucedkfdkplobzpxnl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_epBi3zw2UHCBTNcrUJeXzg_SCVvw3-F";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
