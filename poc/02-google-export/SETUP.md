# POC-B setup: Google sign-in for one-click export (~10 min, one time)

Do this signed in as your **newtonschool.co** account at https://console.cloud.google.com.

1. **Create a project.** Open the project picker at the top, choose **New project**, name it `mind-map-export`, and leave the organisation as newtonschool.co.
2. **Enable the Sheets API.** Go to **APIs & Services → Library**, search for **Google Sheets API**, and click **Enable**.
3. **Set up the consent screen.** Go to **APIs & Services → OAuth consent screen** (the page may be titled "Google Auth Platform"), then **Get started**.
   - App name: `Mind map export`. Support email: your email.
   - Audience: **Internal**. With Internal, only newtonschool.co accounts can sign in, and Google doesn't need to review the app.
4. **Create the client.** Go to **Clients → Create client**.
   - Type: **Web application**.
   - Authorized JavaScript origins: `http://localhost:5173`
   - Click **Create** and copy the **Client ID**, which ends in `.apps.googleusercontent.com`. The client ID isn't a secret. You won't need the client secret.
5. Run `npm run dev`, open http://localhost:5173/poc/02-google-export/, paste the client ID, pick a sample, and click **Export to Google Sheets**.

The app only asks for `drive.file`, which lets it see and edit only the files it creates itself. It can't read the rest of your Drive.

## If something is blocked, tell me which step and the exact message

| What you see | What it means | Fallback |
|---|---|---|
| Can't create a project / "organization policy" | IT restricts Cloud projects | Apps Script endpoint (no Cloud project needed) |
| "Internal" is greyed out | The account isn't in a Workspace organisation | Use "External" + add yourself as a test user |
| Sign-in shows "access blocked by admin" | Workspace blocks unconfigured OAuth apps | Ask IT to trust the client ID, or use Apps Script |
| Everything is blocked | — | The .xlsx download (already working in POC-A) |
