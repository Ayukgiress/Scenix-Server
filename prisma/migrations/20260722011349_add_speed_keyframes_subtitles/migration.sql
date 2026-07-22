-- AlterTable
ALTER TABLE "TimelineClip" ADD COLUMN     "keyframes" JSONB,
ADD COLUMN     "speed" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "SubtitleTrack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Subtitles',
    "language" TEXT NOT NULL DEFAULT 'en',
    "srtContent" TEXT NOT NULL,
    "vttContent" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubtitleTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubtitleTrack_projectId_idx" ON "SubtitleTrack"("projectId");

-- AddForeignKey
ALTER TABLE "SubtitleTrack" ADD CONSTRAINT "SubtitleTrack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
