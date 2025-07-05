// src/app/layout.tsx
import "./globals.css";
import { CustomPrivyProvider } from "@/context/PrivyProvider"; // Updated import

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <CustomPrivyProvider>
          {" "}
          {/* Updated component name */}
          {children}
        </CustomPrivyProvider>
      </body>
    </html>
  );
}
