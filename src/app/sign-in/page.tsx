"use client";

import { useActionState } from "react";
import Image from "next/image";
import { MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FadeIn } from "@/components/motion/fade-in";
import { sendMagicLink, type SendMagicLinkState } from "./actions";

const initialState: SendMagicLinkState = { status: "idle" };

export default function SignInPage() {
  const [state, action, pending] = useActionState(sendMagicLink, initialState);

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 lg:block">
        <Image
          src="/sign-in-hero.jpg"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
        <div className="relative z-10 flex h-full flex-col justify-end p-12">
          <FadeIn>
            <p className="text-sm font-medium text-accent-gold">Welcome back</p>
            <h1 className="mt-2 max-w-sm text-3xl font-semibold leading-tight text-white">
              Pick up right where you left off with your export mentor.
            </h1>
            <p className="mt-3 max-w-sm text-sm text-white/80">
              From sourcing to pricing in dollars, your next conversation is one
              click away.
            </p>
          </FadeIn>
        </div>
      </div>

      <div className="flex w-full flex-col justify-center px-6 py-16 lg:w-1/2">
        <FadeIn className="mx-auto w-full max-w-sm">
          <div className="space-y-1.5 text-center lg:text-left">
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Enter the email you paid with — we&apos;ll send you a link to sign in,
              no password needed.
            </p>
          </div>

          <div className="mt-6">
            {state.status === "sent" ? (
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <MailCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>
                  {state.alreadySent ? (
                    <>
                      We already sent a link to{" "}
                      <span className="font-medium">{state.email}</span> — check your
                      inbox, or wait a minute to request a new one.
                    </>
                  ) : (
                    <>
                      Check <span className="font-medium">{state.email}</span> for a
                      sign-in link.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <form action={action} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                {state.status === "error" && (
                  <p className="text-sm text-destructive">{state.message}</p>
                )}
                <Button type="submit" disabled={pending} className="w-full">
                  {pending ? "Sending..." : "Send sign-in link"}
                </Button>
              </form>
            )}
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
