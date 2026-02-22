import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outlet Master — Premium Fashion & Lifestyle Store",
  description: "Shop the latest in fashion, shoes, and lifestyle products. Fast delivery across Libya. Cash on delivery and bank transfer accepted.",
  keywords: "outlet, fashion, shoes, clothing, Libya, online shopping, Tripoli, Benghazi",
  openGraph: {
    title: "Outlet Master — Premium Fashion & Lifestyle Store",
    description: "Shop the latest in fashion, shoes, and lifestyle products. Fast delivery across Libya.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <body>
        {children}
      </body>
    </html>
  );
}
