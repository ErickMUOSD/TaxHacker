import { SubscriptionExpired } from "@/components/auth/subscription-expired"
import ScreenDropArea from "@/components/files/screen-drop-area"
import MobileMenu from "@/components/sidebar/mobile-menu"
import { AppSidebar } from "@/components/sidebar/sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import config from "@/lib/config"
import { getApps } from "@/app/(app)/apps/common"
import { getUnsortedFilesCount } from "@/models/files"
import type { Metadata, Viewport } from "next"
import "../globals.css"
import { NotificationProvider } from "./context"

export const metadata: Metadata = {
  title: {
    template: `%s | ${config.app.title}`,
    default: config.app.title,
  },
  description: config.app.description,
  // ?v= busts the browser favicon cache after a rebrand; bump it whenever the icons change
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "48x48" },
      { url: "/favicon-32x32.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png?v=2", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=2",
    apple: "/apple-touch-icon.png?v=2",
  },
  manifest: "/site.webmanifest",
}

export const viewport: Viewport = {
  themeColor: "#0A1118",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  const [unsortedFilesCount, apps] = await Promise.all([getUnsortedFilesCount(user.id), getApps()])

  const userProfile = {
    id: user.id,
    name: user.name || "",
    email: user.email,
    avatar: user.avatar ? user.avatar + "?" + user.id : undefined,
    membershipPlan: user.membershipPlan || "unlimited",
    storageUsed: user.storageUsed || 0,
    storageLimit: user.storageLimit || -1,
    aiBalance: user.aiBalance || 0,
  }

  return (
    <NotificationProvider>
      <ScreenDropArea>
        <SidebarProvider>
          <MobileMenu unsortedFilesCount={unsortedFilesCount} />
          <AppSidebar
            profile={userProfile}
            unsortedFilesCount={unsortedFilesCount}
            isSelfHosted={config.selfHosted.isEnabled}
            apps={apps.map((app) => ({
              id: app.id,
              name: app.manifest.name,
              icon: app.manifest.icon,
            }))}
          />
          <SidebarInset className="w-full h-full mt-[60px] md:mt-0 overflow-auto">
            {isSubscriptionExpired(user) && <SubscriptionExpired />}
            {children}
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
      </ScreenDropArea>
    </NotificationProvider>
  )
}

export const dynamic = "force-dynamic"
