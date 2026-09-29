import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "./prisma"
import { normalizeInstitutionalEmail } from "./institutionalEmail"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role?: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role?: string
  }
}

import type { DefaultSession } from "next-auth"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        // Validación estricta: regex exacta, sin subdominios ni sufijos.
        const email = normalizeInstitutionalEmail(String(credentials.email))
        if (!email) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            studentProfile: true,
            teacherProfile: true
          }
        })

        if (!user) {
          return null
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
      }

      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) || (token.sub as string)
        session.user.role = (token.role as string | undefined) ?? undefined
      }

      return session
    }
  },
  pages: {
    signIn: "/login"
  }
})
