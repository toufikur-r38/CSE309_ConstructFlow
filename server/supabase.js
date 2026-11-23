/* Supabase Auth clients. Used only for sign-in and account admin; records go through pg (db.js).
   Nothing is stored inside these clients: tokens live in the browser's httpOnly cookies and are
   passed in on every call, so one user's session can never leak into another user's request. */
const {createClient} = require('@supabase/supabase-js');
const config = require('./config');

const options = {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}};

// A fresh client per sign-in or refresh, because those calls keep the new session inside the client.
const authClient = () => createClient(config.supabaseUrl, config.supabasePublishableKey, options);

// Secret-key client for checking tokens and managing accounts. Server only.
const adminClient = createClient(config.supabaseUrl, config.supabaseSecretKey, options);

module.exports = {authClient, adminClient};
