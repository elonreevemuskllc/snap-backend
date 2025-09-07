# Snap Backend API

API Node.js/Express pour récupérer les informations de profils Snapchat via Apify.

## Endpoints

- `GET /` - Health check
- `POST /api/snap/lookup` - Recherche de profil Snapchat

## Variables d'environnement

- `PORT` - Port du serveur (défaut: 3000)
- `APIFY_TOKEN` - Token API Apify

## Démarrage local

```bash
npm install
npm run dev
```

## Exemple d'utilisation

```bash
curl -X POST http://localhost:3000/api/snap/lookup \
  -H "Content-Type: application/json" \
  -d '{"username":"fcbarcelona"}'
```
