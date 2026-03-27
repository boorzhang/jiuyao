import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 构建视频详情 + 评论 JSON
 * @param {Map} videoMap - id → video 对象
 * @param {string} commentsDir - comments/_by_id 目录
 * @param {string} outDir - r2-data 输出目录
 * @returns {{ detailCount: number, commentCount: number }}
 */
export function buildDetails(videoMap, commentsDir, outDir) {
  let detailCount = 0;
  let commentCount = 0;

  for (const [id, v] of videoMap) {
    const raw = v.raw || {};
    const detail = {
      id: v.id,
      title: v.title || raw.title,
      newsType: v.newsType || raw.newsType,
      cover: raw.cover || '',
      coverThumb: raw.coverThumb || '',
      seriesCover: raw.seriesCover || [],
      playTime: raw.playTime || 0,
      playCount: raw.playCount || 0,
      likeCount: raw.likeCount || 0,
      commentCount: raw.commentCount || 0,
      collectCount: raw.collectCount || 0,
      shareCount: raw.shareCount || 0,
      coins: raw.coins || 0,
      originCoins: raw.originCoins || 0,
      freeArea: raw.freeArea || false,
      freeTime: raw.freeTime || 0,
      resolution: raw.resolution || '',
      size: raw.size || 0,
      createdAt: raw.createdAt || '',
      tags: (raw.tags || []).map(t => ({ name: t.name || t, id: t.id || '' })),
      publisher: raw.publisher ? {
        uid: raw.publisher.uid,
        name: raw.publisher.name,
        portrait: raw.publisher.portrait || '',
        gender: raw.publisher.gender || '',
        vipLevel: raw.publisher.vipLevel || 0,
        fans: raw.publisher.fans || 0,
        totalWorks: raw.publisher.totalWorks || 0,
        summary: raw.publisher.summary || '',
      } : null,
      categoryList: v.categoryList || [],
      sourceURL: v.sourceURL || '',
    };

    const videoDir = join(outDir, 'data', 'video', id);
    mkdirSync(videoDir, { recursive: true });
    writeFileSync(join(outDir, 'data', 'video', `${id}.json`), JSON.stringify(detail));
    detailCount++;

    // 评论
    const commentFile = join(commentsDir, `VID${id}.json`);
    if (existsSync(commentFile)) {
      try {
        const commentData = JSON.parse(readFileSync(commentFile, 'utf-8'));
        const comments = (commentData.comments || []).map(c => ({
          id: c.id,
          userName: c.userName,
          userPortrait: c.userPortrait || '',
          content: c.content,
          likeCount: c.likeCount || 0,
          city: c.city || '',
          gender: c.gender || '',
          age: c.age || 0,
          createdAt: c.createdAt || '',
          replies: (c.allReplies || []).map(r => ({
            id: r.id,
            userName: r.userName,
            content: r.content,
            likeCount: r.likeCount || 0,
            createdAt: r.createdAt || '',
          })),
        }));
        if (comments.length > 0) {
          writeFileSync(join(videoDir, 'comments.json'), JSON.stringify(comments));
          commentCount++;
        }
      } catch {
        // 跳过解析失败的评论
      }
    }
  }

  return { detailCount, commentCount };
}
