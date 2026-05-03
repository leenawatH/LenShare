# LenShare — เล่นแชร์

แอปเว็บสำหรับคำนวณและบันทึกวงแชร์แบบไทย รองรับ 2 รูปแบบ:
- **เปียแชร์** (auction) — ประมูลดอก ใครให้ดอกสูงสุดได้เงินก้อนงวดนั้น
- **ตามคิว** (queue) — กำหนดลำดับล่วงหน้า ไม่มีดอก

> ไม่มีการรับ-จ่ายเงินจริงในแอป — ใช้คำนวณและเก็บ record เท่านั้น

## Tech stack

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** (Postgres + Auth + RLS) — หลายผู้ใช้เข้าถึงข้อมูลร่วมกันได้

## Setup

### 1. Clone & install

```bash
npm install
```

### 2. ตั้งค่า Supabase

1. สร้าง project ที่ https://supabase.com (region แนะนำ: Singapore)
2. ไปที่ **SQL Editor** → กด **New query** → copy ทั้งไฟล์ `supabase/schema.sql` วาง → กด **Run**
3. ไปที่ **Project Settings → API** → copy:
   - Project URL
   - `anon` / `publishable` key
   - `service_role` key (เก็บลับ)

### 3. Environment variables

สร้างไฟล์ `.env.local` ที่ root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 4. รัน

```bash
npm run dev
```

เปิด http://localhost:3000 → สมัครสมาชิก → เริ่มสร้างวงแชร์

## โครงสร้างโปรเจกต์

```
src/
  app/
    layout.tsx              # root layout
    page.tsx                # redirect → /groups
    login/                  # หน้าเข้าสู่ระบบ
    signup/                 # หน้าสมัครสมาชิก
    auth/signout/           # logout endpoint
    groups/
      layout.tsx            # nav + auth guard
      page.tsx              # รายการวงแชร์
      new/page.tsx          # สร้างวง
      [id]/
        page.tsx            # รายละเอียดวง + สรุปยอด
        round-editor.tsx    # ฟอร์มบันทึกผลแต่ละรอบ
  lib/
    supabase/
      client.ts             # browser client
      server.ts             # server client
      middleware.ts         # session refresh + protected route
      types.ts              # Database types
    share-math.ts           # คำนวณเงิน/ดอก/สรุปยอด
    utils.ts                # formatTHB, formatDate, cn
  middleware.ts             # protected routes
supabase/
  schema.sql                # SQL migration (run ใน Supabase SQL editor)
```

## ตรรกะการคำนวณ

ดูรายละเอียดใน `src/lib/share-math.ts`

### เปียแชร์ (auction)

ในแต่ละงวดที่มีการประมูล:

- **เงินก้อนรวม** = `เงินต้น × จำนวนลูกแชร์`
- **ผู้ชนะรับสุทธิ** = `เงินก้อนรวม − ดอกที่ตัวเองเปีย − ค่าท้าวแชร์`
- **ลูกแชร์ที่ยังไม่เปีย จ่าย/คน** = `เงินต้น − (ดอก ÷ จำนวนคนที่ยังไม่เปีย ไม่รวมผู้ชนะ)`
- **ลูกแชร์ที่เปียแล้ว จ่าย/คน** = `เงินต้น` เต็ม
- **ค่าท้าวแชร์** = หักจากผู้ชนะ และไปเป็นรายรับของท้าวแชร์ในตารางสรุป

### ตามคิว (queue)

- ทุกคนจ่าย `เงินต้น` เต็มทุกงวด
- ผู้ชนะ (ตามคิว) รับ `เงินต้น × จำนวนลูกแชร์ − ค่าท้าว`

## RLS / Permissions

- ทุก table เปิด RLS
- เห็นข้อมูลวงแชร์ก็ต่อเมื่อ:
  - เป็น owner (ท้าวแชร์), หรือ
  - เป็นสมาชิก (มี row ใน `memberships`)
- เฉพาะ owner เท่านั้นที่ insert/update/delete ได้

## Scripts

```bash
npm run dev        # dev server (port 3000)
npm run build      # production build
npm run start      # serve build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```
