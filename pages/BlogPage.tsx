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

const sanitizeArticleHtml = (html: string) => {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script,style,iframe,object,embed,form,input,button').forEach((node) => node.remove());
  parsed.body.querySelectorAll('*').forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (attribute.name.startsWith('on') || attribute.name === 'style') element.removeAttribute(attribute.name);
      if (['href', 'src'].includes(attribute.name) && /^\s*(javascript|data:text\/html)/i.test(attribute.value)) element.removeAttribute(attribute.name);
    });
    if (element.tagName === 'A') {
      element.setAttribute('rel', 'noopener noreferrer');
      element.setAttribute('target', '_blank');
    }
  });
  return parsed.body.innerHTML;
};

const renderArticleContent = (content: string) => {
  if (/<(?:h[1-6]|p|ul|ol|blockquote|figure|img|strong|em|a)\b/i.test(content)) {
    return <div className="published-article" dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(content) }} />;
  }
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
      <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-5 animate-in fade-in duration-500">
        <Link to="/blog" className="inline-flex items-center gap-3 text-blue-600 font-black text-[11px] uppercase tracking-widest mb-5">
          <i className="fas fa-arrow-left"></i>
          Back to articles
        </Link>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-8 items-start">
          <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 md:p-8 shadow-sm">
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
              <div className="max-w-4xl mb-7">
                <img
                  src={activePost.coverImage}
                  alt=""
                  className="w-full max-h-[360px] object-cover rounded-2xl border border-slate-100"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2 mb-7">
              {activePost.tags?.map((tag) => (
                <Link key={tag} to="/blog" className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                  #{tag}
                </Link>
              ))}
            </div>

            <div className="max-w-4xl text-slate-700 text-base leading-8 space-y-6">
              {renderArticleContent(activePost.content)}
            </div>

            {activePost.faqs && activePost.faqs.length > 0 && (
              <section className="max-w-4xl mt-10 bg-slate-50 rounded-[1.5rem] p-5 border border-slate-100">
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

            <div className="max-w-4xl mt-8">
              <button onClick={() => sharePost(activePost)} className="w-full px-6 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest">
                <i className="fas fa-share-alt mr-2"></i>
                Share Article
              </button>
            </div>

            <nav className="max-w-4xl mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
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

          <BlogSidebar posts={posts} />
        </div>
      </div>
    );
  }

  const featuredPost = filteredPosts.find((post) => post.featured) || filteredPosts[0];
  const articlePosts = filteredPosts.slice(0, 8);
  const visibleTrendingPosts = (trendingPosts.length > 0 ? trendingPosts : popularPosts).slice(0, 4);
  const topicNames = ['CBT', 'JAMB', 'CGPA', 'Academics', 'Study Tips', 'Students'];

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-10 py-5 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-8 items-start">
        <main className="space-y-4 min-w-0">
          {featuredPost ? (
            <Link to={`/blog/${featuredPost.slug || featuredPost.id}`} className="group grid grid-cols-1 lg:grid-cols-[1.05fr_.95fr] min-h-[265px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 to-white shadow-sm">
              <div className="p-7 lg:p-8 flex flex-col justify-center order-2 lg:order-1">
                <div className="flex items-center gap-3 mb-4">
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-blue-600">Featured</span>
                  <span className="text-xs font-bold text-slate-500">{featuredPost.category}</span>
                </div>
                <h1 className="max-w-xl text-3xl lg:text-4xl font-black leading-[1.08] tracking-tight text-slate-950 group-hover:text-blue-600 transition">{featuredPost.title}</h1>
                <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500 line-clamp-2">{featuredPost.excerpt}</p>
                <div className="mt-5 flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-500">
                  <span><i className="far fa-clock mr-2" />{featuredPost.readTime || 1} min read</span>
                  <span><i className="far fa-eye mr-2" />{(featuredPost.viewCount || 0).toLocaleString()} views</span>
                  <span className="rounded-lg bg-blue-600 px-5 py-3 font-bold text-white">Read article <i className="fas fa-arrow-right ml-2" /></span>
                </div>
              </div>
              <div className="order-1 lg:order-2 min-h-[220px] overflow-hidden">
                {featuredPost.coverImage ? <img src={featuredPost.coverImage} alt="" className="h-full w-full object-cover group-hover:scale-105 transition duration-700" /> : <div className="h-full bg-blue-100" />}
              </div>
            </Link>
          ) : (
            <div className="py-16 text-center bg-slate-50 rounded-2xl border border-slate-100">
              <i className="fas fa-newspaper text-slate-200 text-5xl mb-5"></i>
              <p className="text-slate-500 font-bold">No articles match your current search.</p>
            </div>
          )}

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1">
              <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search articles, topics or keywords..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['All', ...topicNames].map((topic) => <button key={topic} onClick={() => setActiveTag(topic)} className={`whitespace-nowrap rounded-full px-4 py-2.5 text-xs font-bold transition ${activeTag === topic ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-slate-100 text-slate-600 hover:bg-blue-50'}`}>{topic === 'All' ? 'All Topics' : topic}</button>)}
            </div>
          </div>

          {visibleTrendingPosts.length > 0 && (
            <section className="py-2">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-50 text-orange-500"><i className="fas fa-fire" /></span>Trending now</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
                {visibleTrendingPosts.map((post, index) => (
                  <Link key={post.id} to={`/blog/${post.slug || post.id}`} className="flex items-start gap-3 px-3 py-2 lg:border-r lg:last:border-0 border-blue-100 hover:text-blue-600 transition">
                    <span className="text-xl font-black text-blue-600">{String(index + 1).padStart(2, '0')}</span>
                    <div className="min-w-0">
                      <h3 className="font-black leading-tight text-xs text-slate-900 line-clamp-2">{post.title}</h3>
                      <p className="text-[10px] text-slate-500 mt-1">{(post.viewCount || 0).toLocaleString()} views</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="pb-3">
            {articlePosts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {articlePosts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="py-10 text-center bg-slate-50 rounded-[1.5rem] border border-slate-100">
                <p className="text-slate-500 font-bold">No more articles match this view.</p>
              </div>
            )}
            {articlePosts.length > 0 && <button className="mx-auto mt-4 flex items-center gap-3 rounded-lg border border-blue-200 px-6 py-3 text-xs font-black text-blue-600 hover:bg-blue-50">Load more articles <i className="fas fa-arrow-down" /></button>}
          </section>
        </main>

        <BlogSidebar posts={posts} onTopicSelect={setActiveTag} />
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
  posts: BlogPost[];
  onTopicSelect?: (topic: string) => void;
}> = ({ posts, onTopicSelect }) => {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'submitting' | 'subscribed' | 'error'>('idle');
  const [newsletterError, setNewsletterError] = useState('');
  const topics = ['CBT', 'JAMB', 'CGPA', 'Academics', 'Study Tips', 'Students'];
  const icons = ['fa-layer-group', 'fa-user-graduate', 'fa-bullseye', 'fa-book', 'fa-lightbulb', 'fa-users'];
  const count = (topic: string) => posts.filter((post) => post.category.toLowerCase() === topic.toLowerCase() || post.tags?.some((tag) => tag.toLowerCase() === topic.toLowerCase())).length;
  return <aside className="space-y-4 xl:sticky xl:top-24">
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3 text-sm font-black"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><i className="far fa-star" /></span>Popular Topics</h2>
      <div className="grid grid-cols-2 gap-2">
        {topics.map((topic, index) => <Link key={topic} to="/blog" onClick={(event) => { if (onTopicSelect) { event.preventDefault(); onTopicSelect(topic); } }} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 hover:border-blue-200 hover:bg-blue-50">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><i className={`fas ${icons[index]}`} /></span>
          <span><strong className="block text-xs text-slate-900">{topic}</strong><small className="text-[10px] text-slate-500">{count(topic)} articles</small></span>
        </Link>)}
      </div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-200"><i className="far fa-envelope" /></span>
      <h2 className="mt-4 text-xl font-black leading-tight text-slate-950">Study smarter, every week.</h2>
      <p className="mt-2 text-xs leading-5 text-slate-500">Get useful study tips, admission updates, academic guides, and new resources delivered to your inbox.</p>
      {newsletterStatus === 'subscribed' ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-700">
          <i className="fas fa-check-circle mt-0.5" />
          <div><strong className="block text-xs">You're on the list!</strong><span className="text-[10px]">Watch your inbox for the next update.</span></div>
        </div>
      ) : (
        <form className="mt-4 space-y-2" onSubmit={async (event) => {
          event.preventDefault();
          const email = newsletterEmail.trim().toLowerCase();
          if (!email) return;
          setNewsletterStatus('submitting');
          setNewsletterError('');
          try {
            const response = await fetch('/api/newsletter/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, website: '' }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Unable to subscribe right now.');
            setNewsletterStatus('subscribed');
          } catch (error: any) {
            setNewsletterStatus('error');
            setNewsletterError(error?.message || 'Unable to subscribe right now.');
          }
        }}>
          <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label htmlFor="blog-newsletter-email" className="sr-only">Email address</label>
          <input id="blog-newsletter-email" type="email" required autoComplete="email" value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} placeholder="Enter your email address" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10" />
          <button type="submit" disabled={newsletterStatus === 'submitting'} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-black text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20 disabled:cursor-wait disabled:bg-blue-400">{newsletterStatus === 'submitting' ? 'Subscribing…' : 'Subscribe to Newsletter'} <i className="fas fa-arrow-right ml-2" /></button>
          {newsletterStatus === 'error' && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[10px] text-red-600">{newsletterError}</p>}
        </form>
      )}
      <p className="mt-3 text-[9px] leading-4 text-slate-400"><i className="fas fa-lock mr-1" />No spam. Unsubscribe whenever you like.</p>
    </section>
    <section className="rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 p-6 text-white shadow-xl shadow-blue-100">
      <div className="flex items-start justify-between"><h2 className="max-w-[210px] text-xl font-black leading-tight">Join our WhatsApp study community</h2><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-emerald-500"><i className="fab fa-whatsapp text-xl" /></span></div>
      <p className="mt-4 text-xs leading-5 text-blue-100">Get updates, study tips, resources, and motivation straight to your phone.</p>
      <a href={WHATSAPP_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center rounded-lg bg-white px-5 py-3 text-xs font-black text-blue-600"><i className="fab fa-whatsapp mr-2 text-emerald-500" />Join community</a>
      <p className="mt-4 text-[10px] text-blue-100">12.4K+ students already joined</p>
    </section>
  </aside>
};

export default BlogPage;
