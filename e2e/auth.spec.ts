import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    
    // Check for login form elements
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in invalid credentials
    await page.getByLabel(/email/i).fill('invalid@example.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    
    // Should show error message
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible({ timeout: 10000 });
  });

  test('should navigate to register page', async ({ page }) => {
    await page.goto('/login');
    
    // Click register link
    await page.getByText(/create account|sign up|register/i).click();
    
    // Should be on register page
    await expect(page).toHaveURL(/register/);
  });

  test('should display register page with role selector', async ({ page }) => {
    await page.goto('/register');
    
    // Check for register form elements
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i).first()).toBeVisible();
    await expect(page.getByLabel(/name/i)).toBeVisible();
    await expect(page.getByLabel(/role/i)).toBeVisible();
  });
});
