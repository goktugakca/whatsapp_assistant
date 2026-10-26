import { LoginForm } from "./login-form";

export const metadata = { title: "Giriş · Sırada", robots: { index: false } };

export default async function LoginPage(props: PageProps<"/giris">) {
  const { next } = await props.searchParams;
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">İşletme paneli</h1>
      <p className="mt-1 mb-6 text-sm text-muted">Size verilen kullanıcı adı ve şifreyle giriş yapın.</p>
      <div className="rounded-xl border border-border bg-card p-5">
        <LoginForm next={typeof next === "string" ? next : undefined} />
      </div>
    </main>
  );
}
