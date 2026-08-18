/**
 * Verifies the homepage customer journey with end-to-end browser coverage.
 */

import { expect, test } from "@playwright/test";

test("homepage exposes the correct desktop and mobile navigation", async ({ page }, testInfo) => {
  await page.goto("/");

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  await expect(skipLink).toHaveAttribute("href", "#main-content");

  const header = page.locator("header");
  const primaryNavigation = page.locator('nav[aria-label="Primary navigation"]');
  const headerLogo = header.locator("[data-header-logo]");

  if (testInfo.project.name === "mobile") {
    await expect(primaryNavigation).toBeHidden();
    await expect(headerLogo).toBeVisible();
    const accountLink = header.getByRole("button", { exact: true, name: "Account" });
    const wishlistLink = header.getByRole("button", { exact: true, name: "Wishlist" });
    const cartLink = header.getByRole("link", { exact: true, name: "Cart" });
    await expect(accountLink).toBeVisible();
    await expect(wishlistLink).toBeVisible();
    await expect(cartLink).toBeVisible();
    const menuButton = header.locator("[data-mobile-nav-trigger]");
    await expect(menuButton).toBeVisible();
    await expect(menuButton).toHaveAccessibleName("Open navigation menu");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(header.getByRole("search")).toBeVisible();
    await expect(header.getByRole("searchbox", { name: "Search products" })).toBeVisible();

    const menuButtonBox = await menuButton.boundingBox();
    const accountLinkBox = await accountLink.boundingBox();
    const wishlistLinkBox = await wishlistLink.boundingBox();
    const cartLinkBox = await cartLink.boundingBox();
    expect(menuButtonBox).not.toBeNull();
    expect(accountLinkBox).not.toBeNull();
    expect(wishlistLinkBox).not.toBeNull();
    expect(cartLinkBox).not.toBeNull();
    expect(menuButtonBox!.x).toBeLessThan(accountLinkBox!.x);
    expect(accountLinkBox!.x).toBeLessThan(wishlistLinkBox!.x);
    expect(wishlistLinkBox!.x).toBeLessThan(cartLinkBox!.x);

    await expect(async () => {
      if ((await menuButton.getAttribute("aria-expanded")) !== "true") {
        await menuButton.click({ force: true });
      }
      await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    }).toPass({ timeout: 15_000 });
    await expect(menuButton).toHaveAccessibleName("Close navigation menu");
    const mobileNavigation = header.getByRole("navigation", { name: "Mobile navigation" });
    const mobileDialog = page.getByRole("dialog", { name: "Mobile navigation" });
    await expect(mobileDialog).toBeVisible();
    await expect(mobileDialog).toHaveAttribute("aria-modal", "true");
    await expect(mobileNavigation).toBeVisible();
    await expect(mobileNavigation).toHaveCSS("position", "fixed");
    expect((await mobileNavigation.boundingBox())?.x).toBe(0);
    await expect(mobileNavigation.getByRole("link", { exact: true, name: "Home" })).toBeVisible();
    await expect(mobileNavigation.getByRole("link", { exact: true, name: "Shop all" })).toBeVisible();
    await expect(mobileNavigation.getByRole("link", { exact: true, name: "Balloons" })).toBeVisible();
    const mobileToysButton = mobileNavigation.getByRole("button", { exact: true, name: "Toys" });
    await expect(mobileToysButton).toBeVisible();
    await expect(mobileToysButton).toHaveAttribute("aria-expanded", "false");
    await mobileToysButton.click();
    await expect(mobileToysButton).toHaveAttribute("aria-expanded", "true");
    await expect(mobileNavigation.getByRole("link", { exact: true, name: "Shop All Toys" })).toBeVisible();

    const lastDrawerLink = mobileNavigation.getByRole("link").last();
    await lastDrawerLink.focus();
    await page.keyboard.press("Tab");
    await expect(header.getByRole("button", { name: "Close navigation menu" })).toBeFocused();

    const backdrop = header.getByRole("button", { name: "Close mobile navigation backdrop" });
    const backdropBox = await backdrop.boundingBox();
    expect(backdropBox).not.toBeNull();
    await backdrop.click({ position: { x: backdropBox!.width - 4, y: 80 } });
    await expect(mobileNavigation).toBeHidden();
    await expect(menuButton).toBeFocused();
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");

    await menuButton.click();
    await page.keyboard.press("Escape");
    await expect(mobileNavigation).toBeHidden();
    await expect(menuButton).toBeFocused();

    await page.setViewportSize({ height: 1024, width: 768 });
    await expect(headerLogo).toBeVisible();
    await expect(menuButton).toBeVisible();
    await expect(accountLink).toBeVisible();
    await expect(wishlistLink).toBeVisible();
    await expect(cartLink).toBeVisible();
    await expect(header.getByRole("link", { exact: true, name: "Shop" })).toHaveCount(0);

    await menuButton.click();
    await expect(mobileNavigation).toBeVisible();
    const tabletNavigationBox = await mobileNavigation.boundingBox();
    const tabletHeaderBox = await header.boundingBox();
    expect(tabletNavigationBox).not.toBeNull();
    expect(tabletHeaderBox).not.toBeNull();
    expect(tabletNavigationBox!.y).toBe(tabletHeaderBox!.height);

    await page.setViewportSize({ height: 800, width: 1280 });
    await expect(mobileNavigation).toBeHidden();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  } else {
    await expect(headerLogo).toBeVisible();
    for (const department of [
      { menuName: "Toy categories", shopAllName: "Shop All Toys", triggerName: "Toys" },
      { menuName: "Party Supplies categories", shopAllName: "Shop All Party Supplies", triggerName: "Party Supplies" }
    ]) {
      const trigger = primaryNavigation.getByRole("button", { exact: true, name: department.triggerName });
      await expect(trigger).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(primaryNavigation.getByRole("group", { name: department.menuName }).getByRole("link", { exact: true, name: department.shopAllName })).toBeVisible();
    }
    await expect(primaryNavigation.getByRole("link", { exact: true, name: "Balloons" })).toBeVisible();
    await expect(header.getByRole("button", { name: "Open navigation menu" })).toBeHidden();
  }

  await expect(header).not.toContainText("Candy");
  const hero = page.locator("[data-store-section='home.hero']");
  const halloweenCarousel = hero.getByRole("region", { name: "Halloween featured collections" });
  const activeHeroImage = halloweenCarousel.getByRole("img", {
    name: "Spiderwebs, a witch crossing an orange moon, and a haunted house"
  });
  await expect(hero).toBeVisible();
  await expect(halloweenCarousel).toBeVisible();
  await expect(activeHeroImage).toBeVisible();
  await expect(hero.getByRole("heading", { name: "Halloween Headquarters" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(activeHeroImage).toHaveCSS("animation-name", "none");
});
