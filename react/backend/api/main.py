from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .routes import overview, explorer, results, scenarios, contracts, common


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Product Wheel API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(overview.router, prefix="/api/overview", tags=["overview"])
app.include_router(explorer.router, prefix="/api/explorer", tags=["explorer"])
app.include_router(results.router, prefix="/api/results", tags=["results"])
app.include_router(scenarios.router, prefix="/api/scenarios", tags=["scenarios"])
app.include_router(contracts.router, prefix="/api/contracts", tags=["contracts"])
app.include_router(common.router, prefix="/api/common", tags=["common"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
