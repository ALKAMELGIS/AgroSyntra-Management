# Microsoft SSO Setup Guide

This guide explains how to configure Microsoft Single Sign-On (SSO) for Al Maha Farm using Azure Active Directory (Azure AD / Microsoft Entra ID).

## Prerequisites

- An Azure account with admin access to your organization's Azure AD
- Access to the Azure Portal (https://portal.azure.com)

## Step 1: Register an Application in Azure AD

1. Go to **Azure Portal** > **Azure Active Directory** > **App registrations**
2. Click **New registration**
3. Fill in the details:
   - **Name**: `Al Maha Farm`
   - **Supported account types**: Choose based on your needs:
     - `Accounts in this organizational directory only` - Single tenant (your company only)
     - `Accounts in any organizational directory` - Multi-tenant
   - **Redirect URI**: 
     - Select `Web`
     - Enter: `http://localhost:3000/auth/microsoft/callback` (for development)
4. Click **Register**

## Step 2: Get Application Credentials

After registration, note these values from the **Overview** page:

1. **Application (client) ID** → `MICROSOFT_CLIENT_ID`
2. **Directory (tenant) ID** → `MICROSOFT_TENANT_ID`

## Step 3: Create a Client Secret

1. Go to **Certificates & secrets** > **Client secrets**
2. Click **New client secret**
3. Add a description (e.g., "Al Maha Farm Backend")
4. Choose expiration (recommended: 24 months)
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately → `MICROSOFT_CLIENT_SECRET`
   - You won't be able to see it again!

## Step 4: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission** > **Microsoft Graph** > **Delegated permissions**
3. Add these permissions:
   - `openid`
   - `profile`
   - `email`
   - `User.Read`
4. Click **Grant admin consent for [Your Organization]**

## Step 5: Configure Redirect URIs

1. Go to **Authentication**
2. Under **Web** > **Redirect URIs**, add:
   - Development: `http://localhost:3000/auth/microsoft/callback`
   - Production: `https://your-domain.com/auth/microsoft/callback`
3. Under **Implicit grant and hybrid flows**, check:
   - `ID tokens`
4. Click **Save**

## Step 6: Update Environment Variables

Add these to your backend `.env` file:

```bash
# Microsoft SSO (Azure AD)
MICROSOFT_CLIENT_ID=your-client-id-from-azure
MICROSOFT_CLIENT_SECRET=your-client-secret-from-azure
MICROSOFT_TENANT_ID=your-tenant-id-from-azure
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback

# App URL (for redirects)
APP_URL=http://localhost:3000
```

For production, update `MICROSOFT_REDIRECT_URI` and `APP_URL` to your production domain.

## Step 7: Test the Integration

1. Start your backend and frontend servers
2. Go to the login page
3. Click "Sign in with Microsoft"
4. You should be redirected to Microsoft login
5. After authentication, you'll be redirected back and logged in

## User Management

### First-Time Users
When a user signs in with Microsoft for the first time:
- A new account is created automatically
- Default role is `worker`
- Admin can change their role in User Management

### Existing Users
If a user already has an account with the same email:
- Their account is linked to their Microsoft ID
- They can now sign in with either method

## Troubleshooting

### "AADSTS50011: Reply URL does not match"
- Check that the redirect URI in Azure exactly matches your `MICROSOFT_REDIRECT_URI`
- Include the full path: `http://localhost:3000/auth/microsoft/callback`

### "AADSTS65001: User has not consented"
- Ensure admin consent was granted for API permissions
- Or enable user consent in your Azure AD settings

### "Invalid client secret"
- Client secrets expire - check the expiration date
- Regenerate if needed and update your `.env`

### User gets "Access Denied"
- Check that the user is in your Azure AD tenant
- For multi-tenant apps, ensure the user's organization has consented

## Security Recommendations

1. **Client Secret Rotation**: Rotate client secrets before expiration
2. **Conditional Access**: Set up Azure AD Conditional Access policies
3. **MFA**: Enable Multi-Factor Authentication in Azure AD
4. **Audit Logs**: Monitor sign-in logs in Azure AD

## Office 365 Email Configuration

If you're using Office 365 for emails (password reset, etc.):

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@yourcompany.com
SMTP_PASS=your-email-password-or-app-password
SMTP_FROM=noreply@yourcompany.com
```

**Note**: If MFA is enabled, you'll need to create an "App Password" in your Microsoft account security settings.
