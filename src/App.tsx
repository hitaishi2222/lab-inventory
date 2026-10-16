import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { AppSidebar } from '@/components/app-sidebar'
import { SiteHeader } from '@/components/site-header'
import { RequireAuth } from '@/components/require-auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import ItemNew from './pages/ItemNew'
import ItemDetail from './pages/ItemDetail'
import Equipment from './pages/Equipment'
import Usage from './pages/Usage'
import Notifications from './pages/Notifications'
import Audit from './pages/Audit'
import Users from './pages/Users'
import Categories from './pages/Categories'
import Settings from './pages/Settings'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Permissions from './pages/Permissions'

const queryClient = new QueryClient()

function AppLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader title={title} />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function page(
  title: string,
  el: React.ReactNode,
  permissions?: (
    | 'inventory:view'
    | 'inventory:create'
    | 'inventory:edit'
    | 'inventory:delete'
    | 'equipment:checkout'
    | 'equipment:return'
    | 'usage:log'
    | 'notifications:view'
    | 'audit:view'
    | 'users:manage'
    | 'categories:manage'
    | 'export:data'
    | 'permissions:manage'
  )[]
) {
  return (
    <RequireAuth permissions={permissions}>
      <AppLayout title={title}>{el}</AppLayout>
    </RequireAuth>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={page('Dashboard', <Dashboard />)} />
            <Route path="/inventory" element={page('Inventory', <Inventory />)} />
            <Route
              path="/inventory/new"
              element={page('Add item', <ItemNew />, ['inventory:create'])}
            />
            <Route
              path="/inventory/:id"
              element={page('Item details', <ItemDetail />, ['inventory:view'])}
            />
            <Route
              path="/equipment"
              element={page('Equipment', <Equipment />, ['inventory:view'])}
            />
            <Route path="/usage" element={page('Usage log', <Usage />, ['usage:log'])} />
            <Route
              path="/notifications"
              element={page('Notifications', <Notifications />, ['notifications:view'])}
            />
            <Route path="/settings" element={page('Settings', <Settings />)} />
            <Route path="/audit" element={page('Audit log', <Audit />, ['audit:view'])} />
            <Route path="/users" element={page('Users', <Users />, ['users:manage'])} />
            <Route
              path="/categories"
              element={page('Categories', <Categories />, ['categories:manage'])}
            />
            <Route
              path="/permissions"
              element={page('Permissions', <Permissions />, ['permissions:manage'])}
            />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
