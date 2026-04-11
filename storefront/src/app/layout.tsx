import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OMCS — متجر الأزياء والماركات العالمية",
  description: "تسوق أحدث الأزياء والأحذية والماركات العالمية. توصيل سريع في جميع أنحاء ليبيا. الدفع نقداً عند الاستلام أو تحويل بنكي.",
  keywords: "أوتلت, أزياء, أحذية, ملابس, ليبيا, تسوق أونلاين, طرابلس, بنغازي, ماركات",
  openGraph: {
    title: "OMCS — متجر الأزياء والماركات العالمية",
    description: "تسوق أحدث الأزياء والأحذية والماركات العالمية. توصيل سريع في جميع أنحاء ليبيا.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
