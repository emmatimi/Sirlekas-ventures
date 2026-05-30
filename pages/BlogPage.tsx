import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BlogPost } from '../types';
import { dbService } from '../services/dbService';

const WHATSAPP_COMMUNITY_URL = 'https://wa.me/2347073992036';

const formatDate = (value?: number) =>
  value
    ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Recently';

const normalize = (value: string) => value.toLowerCase().trim();

const getPostUrl = (post: BlogPost) => `${window.location.origin}/blog/${post.slug || post.id}`;

const renderArticleContent = (content: string) => {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks.map((block, index) => {
    if (block.startsWith('### ')) {
      return <h3 key={index} className="text-xl font-black text-slate-900 tracking-tight pt-3">{block.replace(/^### /, '')}</h3>;
    }
    if (block.startsWith('## ')) {
      return <h2 key={index} className="text-2xl font-black text-slate-900 tracking-tight pt-5">{block.replace(/^## /, '')}</h2>;
    }
    if (block.includes('\n- ')) {
      const [intro, ...items] = block.split('\n');
      return (
        <div key={index} className="space-y-3">
          {intro && <p>{intro.replace(/^- /, '')}</p>}
          <ul className="space-y-2 pl-5">
            {items.map((item, itemIndex) => (
              <li key={itemIndex} className="list-disc marker:text-blue-600">{item.replace(/^- /, '')}</li>
            ))}
          </ul>
        </div>
      );
    }
    return <p key={index}>{block}</p>;
  });
};

const BlogPage: React.FC = () => {
  const { id } = useParams();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState('All');

  useEffect(() => {
    let active = true;
    setLoading(true);
    dbService.getBlogPosts(false)
      .then((items) => {
        if (active) setPosts(items);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const activePost = useMemo(
    () => (id ? posts.find((post) => post.id === id || post.slug === id) : null),
    [id, posts]
  );

  useEffect(() => {
    if (!activePost) return;

    document.title = `${activePost.title} | Sirlekas Ventures Blog`;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', activePost.excerpt);
    void dbService.incrementBlogPostView(activePost.id);
  }, [activePost]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    posts.forEach((post) => {
      tags.add(post.category);
      post.tags?.forEach((tag) => tags.add(tag));
    });
    return ['All', ...Array.from(tags).filter(Boolean).sort((a, b) => a.localeCompare(b))];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const q = normalize(query);
    return posts.filter((post) => {
      const tagMatch = activeTag === 'All' || post.category === activeTag || post.tags?.includes(activeTag);
      const searchText = normalize([post.title, post.excerpt, post.category, ...(post.tags || [])].join(' '));
      return tagMatch && (!q || searchText.includes(q));
    });
  }, [activeTag, posts, query]);

  const popularPosts = useMemo(
    () => posts.slice().sort((a, b) => Number(b.viewCount || 0) - Number(a.viewCount || 0)).slice(0, 5),
    [posts]
  );

  const trendingPosts = useMemo(
    () => posts.filter((post) => post.trending).slice(0, 4),
    [posts]
  );

  const relatedPosts = useMemo(() => {
    if (!activePost) return [];
    const tags = new Set([activePost.category, ...(activePost.tags || [])]);
    return posts
      .filter((post) => post.id !== activePost.id)
      .map((post) => ({
        post,
        score: [post.category, ...(post.tags || [])].filter((tag) => tags.has(tag)).length,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.post);
  }, [activePost, posts]);

  const currentIndex = activePost ? posts.findIndex((post) => post.id === activePost.id) : -1;
  const previousPost = currentIndex > 0 ? posts[currentIndex - 1] : null;
  const nextPost = currentIndex >= 0 && currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null;

  const sharePost = async (post: BlogPost) => {
    const url = getPostUrl(post);
    if (navigator.share) {
      await navigator.share({ title: post.title, text: post.excerpt, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url).catch(() => undefined);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin"></div>
      </div>
    );
  }

  if (id) {
    if (!activePost) {
      return (
        <div className="max-w-3xl mx-auto px-4 py-24 text-center">
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-3">Article Library</p>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-4">Article not found</h1>
          <p className="text-slate-500 mb-8">This post may be unpublished or no longer available.</p>
          <Link to="/blog" className="inline-flex items-center justify-center px-6 py-4 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest">
            Back to Blog
          </Link>
        </div>
      );
    }

    return (
      <div className="max-w-[1280px] mx-auto px-4 lg:px-8 py-10 animate-in fade-in duration-500">
        <Link to="/blog" className="inline-flex items-center gap-3 text-blue-600 font-black text-[11px] uppercase tracking-widest mb-7">
          <i className="fas fa-arrow-left"></i>
          Back to articles
        </Link>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8">
          <article>
            <header className="mb-7">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest">
                  {activePost.category}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  by {activePost.author} . {formatDate(activePost.publishedAt || activePost.createdAt)} . {activePost.readTime || 1} min read . {(activePost.viewCount || 0).toLocaleString()} views
                </span>
              </div>
              <h1 className="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight max-w-4xl">
                {activePost.title}
              </h1>
              <p className="text-base text-slate-500 leading-relaxed mt-4 max-w-3xl">{activePost.excerpt}</p>
            </header>

            {activePost.coverImage && (
              <img
                src={activePost.coverImage}
                alt=""
                className="w-full aspect-[16/6] object-cover rounded-[1.5rem] mb-7 border border-slate-100"
              />
            )}

            <div className="flex flex-wrap gap-2 mb-7">
              {activePost.tags?.map((tag) => (
                <Link key={tag} to="/blog" className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  #{tag}
                </Link>
              ))}
            </div>

            <div className="max-w-3xl text-slate-700 text-base leading-8 space-y-6">
              {renderArticleContent(activePost.content)}
            </div>

            {activePost.faqs && activePost.faqs.length > 0 && (
              <section className="max-w-3xl mt-10 bg-slate-50 rounded-[1.5rem] p-5 border border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Frequently Asked Questions</p>
                <div className="space-y-4">
                  {activePost.faqs.map((faq, index) => (
                    <details key={index} className="bg-white rounded-2xl p-4 border border-slate-100 group">
                      <summary className="cursor-pointer font-black text-slate-900">{faq.question}</summary>
                      <p className="text-sm text-slate-500 leading-relaxed mt-4">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            <div className="max-w-3xl mt-8">
              <button onClick={() => sharePost(activePost)} className="w-full px-6 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest">
                <i className="fas fa-share-alt mr-2"></i>
                Share Article
              </button>
            </div>

            <nav className="max-w-3xl mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              {previousPost && (
                <Link to={`/blog/${previousPost.slug || previousPost.id}`} className="p-5 rounded-2xl bg-white border border-slate-100 soft-shadow">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Previous Post</p>
                  <p className="font-black text-slate-900 leading-tight">{previousPost.title}</p>
                </Link>
              )}
              {nextPost && (
                <Link to={`/blog/${nextPost.slug || nextPost.id}`} className="p-5 rounded-2xl bg-white border border-slate-100 soft-shadow md:text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Next Post</p>
                  <p className="font-black text-slate-900 leading-tight">{nextPost.title}</p>
                </Link>
              )}
            </nav>

            {relatedPosts.length > 0 && (
              <section className="mt-10">
                <h2 className="text-xl font-black text-slate-900 tracking-tight mb-5">You may also like</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {relatedPosts.map((post) => (
                    <PostCard key={post.id} post={post} compact />
                  ))}
                </div>
              </section>
            )}
          </article>

          <BlogSidebar popularPosts={popularPosts} tags={allTags.filter((tag) => tag !== 'All')} />
        </div>
      </div>
    );
  }

  const featuredPost = filteredPosts.find((post) => post.featured) || filteredPosts[0];
  const readMorePosts = filteredPosts.filter(
    (post) => post.id !== featuredPost?.id
  );
  const visibleTrendingPosts = (trendingPosts.length > 0 ? trendingPosts : popularPosts).slice(0, 6);

  return (
    <div className="max-w-[1180px] mx-auto px-4 lg:px-6 py-8 animate-in fade-in duration-500">
      <header className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-end border-b border-slate-100 pb-6 mb-6">
        <div>
          <p className="text-blue-600 font-black uppercase tracking-[0.3em] text-[9px] mb-2">Sirlekas Student Blog</p>
          <h1 className="text-3xl md:text-4xl font-black text-slate-950 tracking-tight leading-tight">News and Articles</h1>
          <p className="text-slate-500 text-sm mt-2 max-w-2xl">
            EKSU updates, admission guides, CBT notes, and student-friendly academic information.
          </p>
        </div>
        <div className="relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"></i>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this blog..."
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-100 outline-none font-bold text-sm focus:ring-4 focus:ring-blue-500/10"
          />
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-8">
        <main className="space-y-8">
          {featuredPost ? (
            <section>
              <SectionTitle title="Latest Updates" />
              <LatestUpdateCard post={featuredPost} />
            </section>
          ) : (
            <div className="py-16 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <i className="fas fa-newspaper text-slate-200 text-5xl mb-5"></i>
              <p className="text-slate-500 font-bold">No articles match your current search.</p>
            </div>
          )}

          {visibleTrendingPosts.length > 0 && (
            <section>
              <SectionTitle title="Trending News" action="Updated daily" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visibleTrendingPosts.map((post, index) => (
                  <Link key={post.id} to={`/blog/${post.slug || post.id}`} className="flex items-start gap-3 border-b border-slate-100 pb-3 hover:text-blue-600 transition">
                    <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-black text-xs flex-shrink-0">{index + 1}</span>
                    <div className="min-w-0">
                      <h3 className="font-black leading-tight text-sm text-slate-900 group-hover:text-blue-600 line-clamp-2">{post.title}</h3>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">{post.category}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <SectionTitle title="Read More" />
              <select
                value={activeTag}
                onChange={(e) => setActiveTag(e.target.value)}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-100 outline-none font-black text-xs text-slate-700 shadow-sm"
              >
                {allTags.map((tag) => <option key={tag}>{tag}</option>)}
              </select>
            </div>
            {readMorePosts.length > 0 ? (
              <div className="space-y-4">
                {readMorePosts.map((post) => (
                  <ReadMoreItem key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="py-10 text-center bg-slate-50 rounded-[1.5rem] border border-slate-100">
                <p className="text-slate-500 font-bold">No more articles match this view.</p>
              </div>
            )}
          </section>
        </main>

        <BlogSidebar
          popularPosts={popularPosts}
          tags={allTags.filter((tag) => tag !== 'All')}
          activeTag={activeTag}
          onTagSelect={setActiveTag}
        />
      </div>
    </div>
  );
};

const SectionTitle: React.FC<{ title: string; action?: string }> = ({ title, action }) => (
  <div className="flex items-center justify-between gap-4 mb-4">
    <div className="flex items-center gap-3">
      <span className="w-1.5 h-5 rounded-full bg-blue-600"></span>
      <h2 className="text-lg font-black text-slate-950 tracking-tight">{title}</h2>
    </div>
    {action && <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{action}</span>}
  </div>
);

const LatestUpdateCard: React.FC<{ post: BlogPost }> = ({ post }) => (
  <Link to={`/blog/${post.slug || post.id}`} className="block group border-b border-slate-100 pb-6">
    {post.coverImage && (
      <img src={post.coverImage} alt="" className="w-full aspect-[16/8] object-cover rounded-2xl border border-slate-100 group-hover:brightness-95 transition" />
    )}
    <div className="pt-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 mb-2">{post.category}</p>
      <h2 className="text-2xl md:text-4xl font-black text-slate-950 tracking-tight leading-tight group-hover:text-blue-600 transition">{post.title}</h2>
      <p className="text-sm text-slate-500 mt-3 line-clamp-3 max-w-3xl">{post.excerpt}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-4">
        by {post.author} . {formatDate(post.publishedAt || post.createdAt)}
      </p>
    </div>
  </Link>
);

const ReadMoreItem: React.FC<{ post: BlogPost }> = ({ post }) => (
  <Link to={`/blog/${post.slug || post.id}`} className="grid grid-cols-[112px_1fr] md:grid-cols-[150px_1fr] gap-4 border-b border-slate-100 pb-4 group">
    {post.coverImage && (
      <img src={post.coverImage} alt="" className="w-full h-full min-h-[96px] object-cover rounded-xl border border-slate-100" />
    )}
    <div className="py-1 min-w-0">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest">
          {post.category}
        </span>
        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          {formatDate(post.publishedAt || post.createdAt)}
        </span>
      </div>
      <h2 className="text-base md:text-lg font-black text-slate-950 tracking-tight leading-tight line-clamp-2 group-hover:text-blue-600 transition">{post.title}</h2>
      <p className="text-xs text-slate-500 leading-relaxed mt-2 line-clamp-2">{post.excerpt}</p>
      <span className="inline-flex mt-3 text-[9px] font-black uppercase tracking-widest text-blue-600">
        Read more <i className="fas fa-arrow-right ml-2"></i>
      </span>
    </div>
  </Link>
);

const FeaturedPost: React.FC<{ post: BlogPost }> = ({ post }) => (
  <Link to={`/blog/${post.slug || post.id}`} className="block bg-white border border-slate-100 rounded-[1.25rem] overflow-hidden shadow-sm hover:shadow-md transition group">
    <div className="grid grid-cols-1 lg:grid-cols-2">
      {post.coverImage && <img src={post.coverImage} alt="" className="w-full h-full min-h-[135px] max-h-[190px] object-cover group-hover:scale-[1.03] transition-transform duration-500" />}
      <div className="p-4 md:p-5 flex flex-col justify-center">
        <p className="text-[8px] font-black uppercase tracking-widest text-blue-600 mb-2">Featured Article</p>
        <h2 className="text-lg md:text-xl font-black text-slate-900 tracking-tight leading-tight mb-2 line-clamp-2">{post.title}</h2>
        <p className="text-xs text-slate-500 leading-relaxed mb-3 line-clamp-2">{post.excerpt}</p>
        <div className="flex flex-wrap items-center gap-2 text-[8px] font-black uppercase tracking-widest text-slate-400">
          <span>{post.category}</span>
          <span>{formatDate(post.publishedAt || post.createdAt)}</span>
          <span>{post.readTime || 1} min read</span>
        </div>
      </div>
    </div>
  </Link>
);

const PostCard: React.FC<{ post: BlogPost; compact?: boolean }> = ({ post, compact = false }) => (
  <Link
    to={`/blog/${post.slug || post.id}`}
    className="bg-white border border-slate-100 rounded-[1.25rem] overflow-hidden shadow-sm group hover:-translate-y-0.5 hover:shadow-md transition-all duration-300"
  >
    {post.coverImage && (
      <img src={post.coverImage} alt="" className={`w-full object-cover group-hover:scale-[1.03] transition-transform duration-500 ${compact ? 'aspect-[16/8]' : 'aspect-[16/8]'}`} />
    )}
    <div className={compact ? 'p-3.5' : 'p-4'}>
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[8px] font-black uppercase tracking-widest">
          {post.category}
        </span>
        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
          {post.readTime || 1} min
        </span>
      </div>
      <h2 className={`${compact ? 'text-sm' : 'text-base'} font-black text-slate-900 tracking-tight leading-tight mb-2.5 line-clamp-2`}>{post.title}</h2>
      {!compact && <p className="text-xs text-slate-500 leading-relaxed mb-4 line-clamp-3">{post.excerpt}</p>}
      <span className="text-[9px] font-black uppercase tracking-widest text-blue-600">
        Read article <i className="fas fa-arrow-right ml-2"></i>
      </span>
    </div>
  </Link>
);

const BlogSidebar: React.FC<{
  popularPosts: BlogPost[];
  tags: string[];
  activeTag?: string;
  onTagSelect?: (tag: string) => void;
}> = ({ popularPosts, tags, activeTag = 'All', onTagSelect }) => (
  <aside className="space-y-7">
    <section>
      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Popular Posts</p>
      <div className="space-y-3">
        {popularPosts.map((post, index) => (
          <Link key={post.id} to={`/blog/${post.slug || post.id}`} className="flex gap-3 border-b border-slate-100 pb-3 group">
            <span className="w-7 h-7 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center font-black text-xs group-hover:bg-blue-600 group-hover:text-white transition flex-shrink-0">
              {index + 1}
            </span>
            <div>
              <p className="font-black text-sm text-slate-900 leading-tight group-hover:text-blue-600 transition">{post.title}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">{(post.viewCount || 0).toLocaleString()} views</p>
            </div>
          </Link>
        ))}
      </div>
    </section>

    <section>
      <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Main Tags</p>
      <div className="flex flex-wrap gap-2">
        {tags.slice(0, 24).map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => onTagSelect?.(tag)}
            className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition ${
              activeTag === tag
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      {activeTag !== 'All' && onTagSelect && (
        <button
          type="button"
          onClick={() => onTagSelect('All')}
          className="mt-4 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800"
        >
          Clear tag filter
        </button>
      )}
    </section>

    <section className="bg-blue-600 rounded-2xl p-5 text-white">
      <p className="text-[10px] font-black uppercase tracking-widest text-blue-100 mb-3">Join Community</p>
      <h2 className="text-xl font-black tracking-tight mb-4">Get updates faster on WhatsApp</h2>
      <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex px-5 py-3 rounded-2xl bg-white text-blue-600 font-black text-xs uppercase tracking-widest">
        Join Now
      </a>
    </section>
  </aside>
);

export default BlogPage;
