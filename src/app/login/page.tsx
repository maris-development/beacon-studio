import { LoginForm } from "@/components/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10 w-full">
      <div className="max-w-sm md:max-w-3xl">
        <LoginForm />
      </div>
    </div>
  )
}
