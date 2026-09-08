import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Sutriva",
  description: "Personal financial intelligence for better decisions"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
