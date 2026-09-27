<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Running the backend locally

Verified from a clean clone against a local PostgreSQL 16:

```bash
# 1. a database to point at
docker compose up -d postgres          # from the repo root
# (or any local postgres: createdb cafeos)

# 2. environment
cp .env.example .env
# edit .env: set DATABASE_URL and DIRECT_URL to your local database

# 3. schema + deps
npm install
npx prisma@5.21.1 generate
npx prisma@5.21.1 db push

# 4. run - note the `set -a` export, see the warning below
set -a; . ./.env; set +a
npm run start:dev                      # http://localhost:3001
```

Then `cd ../frontend && npm install && npm run dev` for the UI on
http://localhost:3000. It talks to the backend via `NEXT_PUBLIC_API_URL`,
defaulting to `http://localhost:3001`.

**The server does not read `.env` by itself.** `src/app.module.ts` never
registers `@nestjs/config`'s `ConfigModule`, so services read `process.env`
directly and the file is ignored unless you export it into the shell first
(step 4 above). Symptoms if you skip it: Prisma cannot find `DATABASE_URL`,
and `PaymentsService` aborts startup with "`key_id` or `oauthToken` is mandatory" because `RAZORPAY_KEY_ID` is empty.

`DIRECT_URL` is required too - `prisma/schema.prisma` declares
`directUrl = env("DIRECT_URL")`, and every Prisma CLI command fails with
`P1012` when it is unset.

## Maintenance scripts

The standalone scripts in this directory - `check-db.js`, `check-tables.js`,
`create-tables.js`, `debug-insert.js`, `list-all.js`, `reset-and-seed.js`,
`run-migration.js`, `seed-data.js`, `seed-shop.js`, `test-neon.js` - connect
straight to the database through `db-client.js`.

They read the connection string from the **`DATABASE_URL`** environment
variable and exit with an error if it is unset. There is no hardcoded
fallback, so set it first:

```bash
# from the backend/ directory
$ export DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
$ node check-db.js
```

If `dotenv` is installed, `db-client.js` also loads `backend/.env`
automatically when the script is run from the `backend/` directory, so putting
`DATABASE_URL` there works too. See `.env.example` for the full variable list.
Never commit a real connection string - `.env` is gitignored, `.env.example`
holds placeholders only.

Note that `reset-and-seed.js` drops and recreates every table. Do not point it
at a database whose data you care about.

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
