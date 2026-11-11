from fastapi import APIRouter, HTTPException, Request, Response, status

from ..deps import DB, client_ip
from ..models import ContactMessage
from ..schemas import ContactIn
from ..security import limiter

router = APIRouter(tags=["contact"])


@router.post("/contact", status_code=status.HTTP_202_ACCEPTED, response_class=Response)
async def contact(body: ContactIn, request: Request, db: DB) -> Response:
    ip = client_ip(request)
    if not (limiter.allow(f"contact:{ip}", 5, 3600) and limiter.allow(f"contact:{body.email}", 3, 3600)):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_requests")
    if not body.website:
        db.add(ContactMessage(name=body.name, email=body.email, topic=body.topic, message=body.message))
        await db.commit()
    return Response(status_code=status.HTTP_202_ACCEPTED)
