# 🔗 URL Shortener with Click Analytics

> A lightweight Bitly-style URL shortener built on AWS Serverless.  
> Create short links, track clicks, and view analytics — all free on AWS Free Tier.

---

## 🌐 Live Links

| Resource | URL |
|---|---|
| **Frontend (S3)** | `http://url-shortner-frontend-YOURNAME.s3-website.ap-south-1.amazonaws.com` |
| **API Gateway** | `https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod` |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      User / Browser                     │
└────────────────┬────────────────────────┬───────────────┘
                 │                        │
                 ▼                        ▼
    ┌────────────────────┐   ┌────────────────────────┐
    │   S3 Static Site   │   │   API Gateway (HTTP)   │
    │    index.html      │   │   ap-south-1 region    │
    └────────────────────┘   └──────┬─────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ Lambda: create   │  │ Lambda: redirect │  │ Lambda: list     │
   │ POST /links      │  │ GET /{code}      │  │ GET /admin/links │
   └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
            └─────────────────────┼─────────────────────┘
                                  ▼
                    ┌─────────────────────────┐
                    │       DynamoDB          │
                    │  url-shortner-links     │
                    │  url-shortner-clicks    │
                    └─────────────────────────┘
```

---

## 📦 Deliverables & Screenshots

### ✅ 1. Hosted UI — S3 Frontend Website

> Add your screenshot here:  
> **How to take:** Open S3 website URL in browser → Press `Win + Shift + S` → Save as `s3-frontend.png`

![image](https://github.com/osuruchaitanya/url-shortner/blob/8ee1d7ea0aab30ff7137a909f967b1e1a06c74bb/Screenshot%202026-05-05%20111407.png)
![S3 Frontend UI](https://github.com/osuruchaitanya/url-shortner/blob/f59186d4ab9c9a568436b09b9ace30b68eeb10a2/Screenshot%202026-05-05%20111510.png)


**Steps to add screenshot:**
```
1. Take screenshot of your S3 website
2. Create folder: url-project/screenshots/
3. Save image as: screenshots/s3-frontend.png
4. git add screenshots/
5. git commit -m "add screenshots"
6. git push origin master
```

---

### ✅ 2. API Gateway — Routes Configuration

> Add your screenshot here:  
> **How to take:** AWS Console → API Gateway → Routes → Screenshot

![API Gateway Routes](https://github.com/osuruchaitanya/url-shortner/blob/a341eae3ba4206c3e09b86909ff25d9995b85e90/Screenshot%202026-05-05%20113019.png)

**API Base URL:**
```
https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod
```

**All Routes Configured:**

| Method | Path | Lambda Function |
|---|---|---|
| `POST` | `/links` | url-shortener-create |
| `GET` | `/{code}` | url-shortener-redirect |
| `GET` | `/admin/links` | url-shortener-list |
| `DELETE` | `/links/{code}` | url-shortener-list |

---

### ✅ 3. DynamoDB Tables

> Add your screenshot here:  
> **How to take:** AWS Console → DynamoDB → Tables → Screenshot

![DynamoDB Tables](screenshots/dynamodb-tables.png)

**Tables Created:**

| Table Name | PK | SK | Status |
|---|---|---|---|
| url-shortner-links | code (String) | — | ✅ Active |
| url-shortner-clicks | pk (String) | sk (String) | ✅ Active |

---

### ✅ 4. Lambda Functions

> Add your screenshot here:  
> **How to take:** AWS Console → Lambda → Functions → Screenshot

![Lambda Functions](screenshots/lambda-functions.png)

**Functions Deployed:**

| Function Name | Handler | Runtime | Memory |
|---|---|---|---|
| url-shortener-create | create.handler | Node.js 20.x | 256 MB |
| url-shortener-redirect | redirect.handler | Node.js 20.x | 128 MB |
| url-shortener-list | list.handler | Node.js 20.x | 256 MB |

---

### ✅ 5. API Test — Create Short Link

> Add your screenshot here:  
> **How to take:** CloudShell → Run curl POST → Screenshot

![Create Link Test](screenshots/api-create-test.png)

**Test Command:**
```bash
curl -X POST https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/links \
  -H "Content-Type: application/json" \
  -d '{"target_url":"https://google.com"}'
```

**Response:**
```json
{
  "code": "ppy8ca",
  "short_url": "https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/ppy8ca",
  "target_url": "https://google.com",
  "created_at": 1777888075605,
  "expires_at": null
}
```

---

### ✅ 6. API Test — 301 Redirect Working

> Add your screenshot here:  
> **How to take:** CloudShell → Run curl -v /{code} → Screenshot

![Redirect Test](screenshots/api-redirect-test.png)

**Test Command:**
```bash
curl -v https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/ppy8ca
```

**Response:**
```
HTTP/2 301
location: https://google.com
x-click-count: 3
```

---

### ✅ 7. API Test — List All Links with Click Count

> Add your screenshot here:  
> **How to take:** Browser → Open /admin/links URL → Screenshot

![List Links Test](screenshots/api-list-test.png)

**Test URL:**
```
https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/admin/links
```

**Response:**
```json
{
  "links": [{
    "code": "ppy8ca",
    "target_url": "https://google.com",
    "click_count": 3,
    "created_at": 1777888075605,
    "expires_at": null,
    "is_expired": false
  }],
  "total": 1,
  "total_clicks": 3,
  "active_count": 1,
  "generated_at": 1777888322176
}
```

---

### ✅ 8. CloudWatch Logs

> Add your screenshot here:  
> **How to take:** AWS Console → CloudWatch → Log groups → Lambda logs → Screenshot

![CloudWatch Logs](screenshots/cloudwatch-logs.png)

**Log Groups:**
```
/aws/lambda/url-shortener-create
/aws/lambda/url-shortener-redirect
/aws/lambda/url-shortener-list
```

---

## 📁 Project Structure

```
url-project/
├── index.html            ← S3 static frontend
├── create.js             ← Lambda: POST /links
├── redirect.js           ← Lambda: GET /{code}
├── list.js               ← Lambda: GET /admin/links
├── package.json          ← Dependencies
├── node_modules/         ← AWS SDK
├── screenshots/          ← Project screenshots
│   ├── s3-frontend.png
│   ├── api-gateway-routes.png
│   ├── dynamodb-tables.png
│   ├── lambda-functions.png
│   ├── api-create-test.png
│   ├── api-redirect-test.png
│   ├── api-list-test.png
│   └── cloudwatch-logs.png
└── README.md
```

---

## 🧪 All API Tests

### Create Short Link
```bash
curl -X POST https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/links \
  -H "Content-Type: application/json" \
  -d '{"target_url":"https://google.com"}'
```

### Test Redirect
```bash
curl -v https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/ppy8ca
```

### List All Links
```bash
curl https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/admin/links
```

### Custom Alias
```bash
curl -X POST https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/links \
  -H "Content-Type: application/json" \
  -d '{"target_url":"https://github.com","custom_code":"mygithub"}'
```

### With Expiry 24 hours
```bash
curl -X POST https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/links \
  -H "Content-Type: application/json" \
  -d '{"target_url":"https://example.com","ttl_seconds":86400}'
```

### Delete a Link
```bash
curl -X DELETE https://st8wy7wez5.execute-api.ap-south-1.amazonaws.com/prod/links/ppy8ca
```

---

## 💰 AWS Free Tier Cost

| Service | Free Tier | Usage |
|---|---|---|
| Lambda | 1M requests/month | ✅ Within |
| DynamoDB | On-demand | ✅ Within |
| API Gateway | 1M calls/month | ✅ Within |
| S3 | 5GB storage | ✅ Less than 1MB |
| CloudWatch | 5GB logs | ✅ 30 day retention |

**Estimated monthly cost: $0.00** ✅

---

## 🔒 Security

- ✅ URL validation — only http and https allowed
- ✅ Code validation — alphanumeric 2-24 chars only
- ✅ IAM least-privilege — Lambda only accesses DynamoDB
- ✅ DynamoDB TTL — auto-expires old links
- ✅ Atomic click increment — no race conditions
- ✅ CORS enabled — frontend can call API

---

## 🛠️ Tech Stack

| Service | Purpose |
|---|---|
| AWS Lambda | Serverless functions Node.js 20.x |
| AWS API Gateway | HTTP API routing |
| AWS DynamoDB | NoSQL database |
| AWS S3 | Static website hosting |
| AWS CloudWatch | Logs and monitoring |


---

## 📄 License

MIT License — Free to use and modify
