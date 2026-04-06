from fastapi import HTTPException


def not_found(resource: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{resource} not found")


def bad_request(msg: str) -> HTTPException:
    return HTTPException(status_code=400, detail=msg)
