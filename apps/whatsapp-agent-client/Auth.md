# How to authenticate

## Generate token
```bash
curl -X POST --location "http://localhost:3001/api/mySession/${WPPCONNECT_SECRET_KEY}/generate-token"
```

Example response

```json
{
  "status": "success",
  "session": "mySession",
  "token": "$2b$10$jVRSB4iwMVTj7dAH6D55reIZSE_73PPYmfTquHvcLlR2Go71DodGy",
  "full": "mySession:$2b$10$jVRSB4iwMVTj7dAH6D55reIZSE_73PPYmfTquHvcLlR2Go71DodGy"
}
```

## Start session
```bash
curl -X POST --location "http://localhost:3001/api/mySession/start-session" \
    -H "Accept: application/json" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${token}"
```

example response with qr code (we will find how to get OTP code)
```json
{
  "status": "INITIALIZING",
  "qrcode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASQAAAEkCAYAAACG",
  "urlcode": "https://wa.me/settings/linked_devices#2@h8wdNs9g803R/R4JJ3iSxAqExisV448MXGXyH4cuU6ivBucklz8d9A9GG8x72xoBw0C39/uRsAGxFiUUpQBniuRMNK5XUBDmZ24=,Jr+qEw0ThkzFUDdxGixYUCO9jI3ggcTyDCHJ6FVELzM=,6eE+8g4OXSvRbo6Uj6+FA77pTM1Fh5dIE4c5d9oXp1c=,Kdq8ne56LdhVmMNKytJ/yjkugqcrwXRwKTYaMvq2/Tc=,0",
  "version": "2.8.6",
  "session": "mySession"
}
```