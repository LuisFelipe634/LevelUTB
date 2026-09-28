FROM node:20-alpine
WORKDIR /app

# /app es de root, asi que se entrega al usuario node antes de instalar:
# a partir de ahi la build y el runtime corren sin privilegios.
RUN chown node:node /app
USER node

COPY --chown=node:node package.json package-lock.json ./
# Prisma 7 genera el client en un paso explicito y no necesita postinstall.
RUN npm ci --ignore-scripts

# Copia explicita en vez de "COPY . .": la imagen no depende de que el
# .dockerignore este completo para no arrastrar .env, .git ni PII.
COPY --chown=node:node tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs prisma.config.ts ./

# Estas tres rutas son codigo y estaticos, nada mas: sin .env, sin llaves, sin
# datos de estudiantes. Verificado sobre la imagen construida (61 archivos en src,
# 8 en prisma, 1 en public, sin .git). El .dockerignore de la raiz es la red que
# cubre lo que alguien agregue a estos directorios en el futuro: excluye
# **/.env, **/*.pem|key|p12|pfx y los CSV de PII del import de PROA. Si alguna
# vez se agrega aqui un archivo con datos sensibles, la copia lo arrastra:
# agregar el patron al .dockerignore.
COPY --chown=node:node src ./src
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node public ./public

# "npm run" y no "npx": el binario viene de node_modules (version fijada por el
# lockfile) y nunca se descarga en tiempo de build.
RUN npm run db:generate
EXPOSE 3000
CMD ["npm", "run", "dev"]
