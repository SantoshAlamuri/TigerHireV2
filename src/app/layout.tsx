import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { PostHogProvider } from "@/lib/analytics/PostHogProvider";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";
import { DevBanner } from "@/components/DevBanner";
import { PageTransitions } from "@/components/PageTransitions";
import ToastProvider from "@/components/ui/Toast";
import "./globals.css";

const plusJakarta = localFont({
  src: "./fonts/PlusJakartaSans-Variable.ttf",
  variable: "--font-jakarta",
  weight: "200 800",
  style: "normal",
  display: "swap",
});

const DEV_SW_RESET_KEY = "tigerhire_dev_sw_reset_v3";

export const viewport: Viewport = {
  themeColor: "#f59e0b",
};

export const metadata: Metadata = {
  title: { default: SITE_MARKETING.defaultTitle, template: `%s | ${SITE_MARKETING.brand}` },
  description: SITE_MARKETING.descriptionShort,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TigerHire",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/logo-icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Consume request so this layout is dynamic; proxy sets x-nonce and CSP on the request
  // so Next.js can apply the nonce to inline scripts (no 'unsafe-inline').
  try {
    await headers();
  } catch (_) {
    // In edge cases (e.g. middleware redirect), headers may be unavailable; still render.
  }
  return (
    <html
      lang="en"
      className="scroll-smooth"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {process.env.NODE_ENV === "development" ? (
          <Script id="dev-sw-reset" strategy="beforeInteractive">{`
            (function () {
              if (typeof window === "undefined") return;
              var isLocalhost =
                window.location.hostname === "localhost" ||
                window.location.hostname === "127.0.0.1";
              if (!isLocalhost || !("serviceWorker" in navigator)) return;
              if (window.sessionStorage.getItem("${DEV_SW_RESET_KEY}") === "done") return;
              Promise.all([
                navigator.serviceWorker.getRegistrations().then(function (registrations) {
                  return Promise.all(
                    registrations.map(function (registration) {
                      return registration.unregister();
                    })
                  );
                }),
                typeof window.caches === "undefined"
                  ? Promise.resolve()
                  : window.caches.keys().then(function (keys) {
                      return Promise.all(
                        keys.map(function (key) {
                          return window.caches.delete(key);
                        })
                      );
                    }),
              ]).finally(function () {
                window.sessionStorage.setItem("${DEV_SW_RESET_KEY}", "done");
                window.location.reload();
              });
            })();
          `}</Script>
        ) : null}
        {process.env.NODE_ENV === "development" ? (
          <Script id="dev-strip-cursor-attrs" strategy="beforeInteractive">{`
            (function () {
              if (typeof document === "undefined") return;
              var strip = function () {
                var nodes = document.querySelectorAll("[data-cursor-ref]");
                for (var i = 0; i < nodes.length; i++) {
                  nodes[i].removeAttribute("data-cursor-ref");
                }
              };
              strip();
              if (typeof MutationObserver === "undefined") return;
              var obs = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                  var m = mutations[i];
                  if (m.type === "attributes" && m.attributeName === "data-cursor-ref" && m.target) {
                    m.target.removeAttribute("data-cursor-ref");
                  }
                }
              });
              obs.observe(document.documentElement, {
                subtree: true,
                attributes: true,
                attributeFilter: ["data-cursor-ref"],
              });
              setTimeout(function () {
                obs.disconnect();
              }, 12000);
            })();
          `}</Script>
        ) : null}
        {process.env.NODE_ENV === "development" ? (
          <Script id="dev-filter-cursor-hydration-noise" strategy="beforeInteractive">{`
            (function () {
              if (typeof console === "undefined") return;
              var patch = function (method) {
                var original = console[method];
                if (typeof original !== "function") return;
                console[method] = function () {
                  try {
                    var first = arguments[0];
                    if (typeof first === "string" &&
                        first.indexOf("A tree hydrated but some attributes of the server rendered HTML didn't match the client properties") !== -1) {
                      var text = "";
                      for (var i = 0; i < arguments.length; i++) {
                        if (typeof arguments[i] === "string") text += arguments[i];
                      }
                      if (text.indexOf("data-cursor-ref") !== -1) return;
                    }
                  } catch (_) {}
                  return original.apply(this, arguments);
                };
              };
              patch("debug");
              patch("error");
              patch("warn");
            })();
          `}</Script>
        ) : null}
        <link rel="preconnect" href="https://supabase.co" />
        <link rel="dns-prefetch" href="https://us.i.posthog.com" />
      </head>
      <body className={`${plusJakarta.variable} font-sans antialiased`} suppressHydrationWarning>
        <AuthProvider>
          <PostHogProvider>
            <ToastProvider>
              <DevBanner />
              <Suspense fallback={children}>
                <PageTransitions>{children}</PageTransitions>
              </Suspense>
              <CookieConsentBanner />
            </ToastProvider>
          </PostHogProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
