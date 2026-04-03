use anchor_lang::prelude::*;

declare_id!("EEnouVLAoQGMEbrypEhP3Ct5RgCViCWG4n1nCZNwMxjQ");

pub const PROFILE_SEED: &[u8] = b"profile";
pub const POST_SEED: &[u8] = b"post";
pub const CHAT_SEED: &[u8] = b"chat";
pub const MESSAGE_SEED: &[u8] = b"message";
pub const FOLLOW_SEED: &[u8] = b"follow";
pub const COMMENT_SEED: &[u8] = b"comment";
pub const REACTION_SEED: &[u8] = b"reaction";
pub const COMMUNITY_SEED: &[u8] = b"community";
pub const MEMBERSHIP_SEED: &[u8] = b"membership";

#[program]
pub mod shadowspace {
    use super::*;

    // ========== PROFILE ==========

    pub fn create_profile(
        ctx: Context<CreateProfile>,
        username: String,
        display_name: String,
        bio: String,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.user.key();
        profile.username = username;
        profile.display_name = display_name;
        profile.bio = bio;
        profile.is_private = false;
        profile.post_count = 0;
        profile.follower_count = 0;
        profile.following_count = 0;
        profile.active_conversation_count = 0;
        profile.avatar_url = String::new();
        profile.banner_url = String::new();
        profile.created_at = Clock::get()?.unix_timestamp;
        msg!("Profile created for {}", profile.owner);
        Ok(())
    }

    /// Resize an existing profile account to the current schema size.
    /// This is needed when the Profile struct grows (e.g. adding follower/following counts).
    pub fn migrate_profile(ctx: Context<MigrateProfile>) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        // If follower_count / following_count were uninitialised (old schema),
        // they'll deserialise as 0 after realloc, which is correct.
        msg!("Profile migrated for {}, new size {}", profile.owner, 8 + Profile::LEN);
        Ok(())
    }

    pub fn update_profile(
        ctx: Context<UpdateProfile>,
        display_name: String,
        bio: String,
        avatar_url: String,
        banner_url: String,
    ) -> Result<()> {
        require!(display_name.len() <= 24, ShadowError::ContentTooLong);
        require!(bio.len() <= 64, ShadowError::ContentTooLong);
        require!(avatar_url.len() <= 128, ShadowError::ContentTooLong);
        require!(banner_url.len() <= 128, ShadowError::ContentTooLong);
        let profile = &mut ctx.accounts.profile;
        profile.display_name = display_name;
        profile.bio = bio;
        profile.avatar_url = avatar_url;
        profile.banner_url = banner_url;
        msg!("Profile updated for {}", profile.owner);
        Ok(())
    }

    // ========== POSTS ==========

    pub fn create_post(
        ctx: Context<CreatePost>,
        post_id: u64,
        content: String,
        is_private: bool,
    ) -> Result<()> {
        require!(content.len() <= 500, ShadowError::ContentTooLong);
        let post = &mut ctx.accounts.post;
        post.author = ctx.accounts.profile.owner;
        post.post_id = post_id;
        post.content = content;
        post.is_private = is_private;
        post.likes = 0;
        post.comment_count = 0;
        post.created_at = Clock::get()?.unix_timestamp;
        let profile = &mut ctx.accounts.profile;
        profile.post_count += 1;
        msg!("Post {} created, private={}", post_id, is_private);
        Ok(())
    }

    pub fn like_post(ctx: Context<LikePost>, _post_id: u64) -> Result<()> {
        let post = &mut ctx.accounts.post;
        post.likes += 1;
        msg!("Post {} liked, total: {}", post.post_id, post.likes);
        Ok(())
    }

    pub fn create_comment(
        ctx: Context<CreateComment>,
        _post_id: u64,
        comment_index: u64,
        content: String,
    ) -> Result<()> {
        require!(content.len() <= 100, ShadowError::ContentTooLong);
        let comment = &mut ctx.accounts.comment;
        comment.post = ctx.accounts.post.key();
        comment.author = ctx.accounts.commenter_profile.owner;
        comment.comment_index = comment_index;
        comment.content = content;
        comment.created_at = Clock::get()?.unix_timestamp;
        let post = &mut ctx.accounts.post;
        post.comment_count += 1;
        msg!("Comment {} on post {}", comment_index, post.post_id);
        Ok(())
    }

    pub fn react_to_post(
        ctx: Context<ReactToPost>,
        _post_id: u64,
        reaction_type: u8,
    ) -> Result<()> {
        let reaction = &mut ctx.accounts.reaction;
        reaction.post = ctx.accounts.post.key();
        reaction.user = ctx.accounts.reactor_profile.owner;
        reaction.reaction_type = reaction_type;
        msg!("Reaction {} on post {}", reaction_type, _post_id);
        Ok(())
    }

    // ========== LEGACY CHAT (kept for backwards compat) ==========

    pub fn create_chat(ctx: Context<CreateChat>, chat_id: u64) -> Result<()> {
        let chat = &mut ctx.accounts.chat;
        chat.chat_id = chat_id;
        chat.user1 = ctx.accounts.user1.key();
        chat.user2 = ctx.accounts.user2.key();
        chat.message_count = 0;
        chat.created_at = Clock::get()?.unix_timestamp;
        msg!("Chat {} created", chat_id);
        Ok(())
    }

    pub fn send_message(
        ctx: Context<SendMessage>,
        chat_id: u64,
        message_index: u64,
        content: String,
        is_payment: bool,
        payment_amount: u64,
    ) -> Result<()> {
        let message = &mut ctx.accounts.message;
        message.chat_id = chat_id;
        message.sender = ctx.accounts.sender.key();
        message.content = content;
        message.is_payment = is_payment;
        message.payment_amount = payment_amount;
        message.timestamp = Clock::get()?.unix_timestamp;
        message.message_index = message_index;
        let chat = &mut ctx.accounts.chat;
        chat.message_count += 1;
        msg!("Message sent in chat {}", chat_id);
        Ok(())
    }

    // ========== COMMUNITIES ==========

    pub fn create_community(
        ctx: Context<CreateCommunity>,
        community_id: u64,
        name: String,
        description: String,
        avatar_url: String,
    ) -> Result<()> {
        require!(name.len() <= 32, ShadowError::ContentTooLong);
        require!(description.len() <= 128, ShadowError::ContentTooLong);
        require!(avatar_url.len() <= 128, ShadowError::ContentTooLong);
        let community = &mut ctx.accounts.community;
        community.creator = ctx.accounts.creator_profile.owner;
        community.community_id = community_id;
        community.name = name;
        community.description = description;
        community.avatar_url = avatar_url;
        community.member_count = 1; // creator auto-joins
        community.created_at = Clock::get()?.unix_timestamp;
        msg!("Community {} created by {}", community.community_id, community.creator);
        Ok(())
    }

    pub fn join_community(ctx: Context<JoinCommunity>, _community_id: u64) -> Result<()> {
        let community = &mut ctx.accounts.community;
        require!(community.member_count < 100, ShadowError::CommunityFull);
        let community_key = community.key();
        community.member_count += 1;
        let membership = &mut ctx.accounts.membership;
        membership.community = community_key;
        membership.member = ctx.accounts.member_profile.owner;
        membership.joined_at = Clock::get()?.unix_timestamp;
        msg!("{} joined community {}", membership.member, _community_id);
        Ok(())
    }

    pub fn leave_community(ctx: Context<LeaveCommunity>, _community_id: u64) -> Result<()> {
        let community = &mut ctx.accounts.community;
        community.member_count = community.member_count.saturating_sub(1);
        msg!("{} left community {}", ctx.accounts.member_profile.owner, community.community_id);
        Ok(())
    }

    pub fn update_community(
        ctx: Context<UpdateCommunity>,
        _community_id: u64,
        description: String,
        avatar_url: String,
    ) -> Result<()> {
        require!(description.len() <= 128, ShadowError::ContentTooLong);
        require!(avatar_url.len() <= 128, ShadowError::ContentTooLong);
        let community = &mut ctx.accounts.community;
        community.description = description;
        community.avatar_url = avatar_url;
        msg!("Community {} updated", community.community_id);
        Ok(())
    }

    pub fn close_community(ctx: Context<CloseCommunity>, _community_id: u64) -> Result<()> {
        msg!("Community {} closed by creator", ctx.accounts.community.community_id);
        Ok(())
    }

    // ========== FOLLOW ==========

    pub fn follow_user(ctx: Context<FollowUser>) -> Result<()> {
        let follow = &mut ctx.accounts.follow_account;
        follow.follower = ctx.accounts.follower_profile.owner;
        follow.following = ctx.accounts.following_profile.owner;

        let follower_profile = &mut ctx.accounts.follower_profile;
        follower_profile.following_count += 1;
        let following_profile = &mut ctx.accounts.following_profile;
        following_profile.follower_count += 1;

        msg!("{} followed {}", follow.follower, follow.following);
        Ok(())
    }

    pub fn unfollow_user(ctx: Context<UnfollowUser>) -> Result<()> {
        let follower_profile = &mut ctx.accounts.follower_profile;
        follower_profile.following_count = follower_profile.following_count.saturating_sub(1);
        let following_profile = &mut ctx.accounts.following_profile;
        following_profile.follower_count = following_profile.follower_count.saturating_sub(1);

        msg!("{} unfollowed {}", follower_profile.owner, following_profile.owner);
        Ok(())
    }

    // ========== CLOSE ACCOUNTS (reclaim rent) ==========

    /// Close a profile account and return rent to the owner
    pub fn close_profile(ctx: Context<CloseProfile>) -> Result<()> {
        msg!("Profile closed for {}", ctx.accounts.profile.owner);
        Ok(())
    }

    /// Close a post account and return rent to the author
    pub fn close_post(ctx: Context<ClosePost>, _post_id: u64) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        profile.post_count = profile.post_count.saturating_sub(1);
        msg!("Post closed");
        Ok(())
    }

    /// Close a comment account and return rent
    pub fn close_comment(ctx: Context<CloseComment>, _post_id: u64, _comment_index: u64) -> Result<()> {
        let post = &mut ctx.accounts.post;
        post.comment_count = post.comment_count.saturating_sub(1);
        msg!("Comment closed");
        Ok(())
    }

    /// Close a reaction account and return rent
    pub fn close_reaction(_ctx: Context<CloseReaction>, _post_id: u64) -> Result<()> {
        msg!("Reaction closed");
        Ok(())
    }

    /// Close a legacy chat account and return rent
    pub fn close_chat(_ctx: Context<CloseChat>, _chat_id: u64) -> Result<()> {
        msg!("Chat closed");
        Ok(())
    }

    /// Close a legacy message account and return rent
    pub fn close_message(_ctx: Context<CloseMessage>, _chat_id: u64, _message_index: u64) -> Result<()> {
        msg!("Message closed");
        Ok(())
    }

    // ========== ADMIN: FORCE CLOSE ANY ACCOUNT ==========

    /// Admin force-close: lets the upgrade authority close ANY program account
    /// and send rent to the authority. Used for devnet cleanup.
    pub fn admin_force_close(ctx: Context<AdminForceClose>) -> Result<()> {
        let target = &ctx.accounts.target_account;
        let authority = &ctx.accounts.authority;
        
        // Transfer all lamports from target to authority
        let lamports = target.lamports();
        **target.try_borrow_mut_lamports()? = 0;
        **authority.try_borrow_mut_lamports()? = authority.lamports().checked_add(lamports).unwrap();
        
        // Zero out the data and assign to system program to fully close
        target.try_borrow_mut_data()?.fill(0);
        target.assign(&anchor_lang::solana_program::system_program::ID);
        
        msg!("Admin force-closed account: {} ({} lamports reclaimed)", target.key(), lamports);
        Ok(())
    }

}

// ========== ACCOUNT CONTEXT STRUCTS ==========

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Profile::LEN, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Fee payer — can be a server keypair for gasless UX
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MigrateProfile<'info> {
    #[account(
        mut,
        realloc = 8 + Profile::LEN,
        realloc::payer = user,
        realloc::zero = false,
        seeds = [PROFILE_SEED, user.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(
        mut,
        realloc = 8 + Profile::LEN,
        realloc::payer = payer,
        realloc::zero = false,
        seeds = [PROFILE_SEED, user.key().as_ref()],
        bump,
    )]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Fee payer — treasury pays for realloc rent in gasless UX
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct CreatePost<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Post::LEN, seeds = [POST_SEED, profile.owner.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(mut, seeds = [PROFILE_SEED, profile.owner.as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub author: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct LikePost<'info> {
    #[account(mut, seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(seeds = [PROFILE_SEED, profile.owner.as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    pub user: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(post_id: u64, comment_index: u64)]
pub struct CreateComment<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Comment::LEN, seeds = [COMMENT_SEED, post.key().as_ref(), &comment_index.to_le_bytes()], bump)]
    pub comment: Account<'info, Comment>,
    #[account(mut, seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(seeds = [PROFILE_SEED, commenter_profile.owner.as_ref()], bump)]
    pub commenter_profile: Account<'info, Profile>,
    #[account(mut)]
    pub author: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct ReactToPost<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Reaction::LEN, seeds = [REACTION_SEED, post.key().as_ref(), reactor_profile.owner.as_ref()], bump)]
    pub reaction: Account<'info, Reaction>,
    #[account(seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(seeds = [PROFILE_SEED, reactor_profile.owner.as_ref()], bump)]
    pub reactor_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(chat_id: u64)]
pub struct CreateChat<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Chat::LEN, seeds = [CHAT_SEED, &chat_id.to_le_bytes()], bump)]
    pub chat: Account<'info, Chat>,
    #[account(mut)]
    pub user1: Signer<'info>,
    /// CHECK: Second chat participant
    pub user2: UncheckedAccount<'info>,
    /// Fee payer — treasury for gasless UX
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(chat_id: u64, message_index: u64)]
pub struct SendMessage<'info> {
    #[account(init_if_needed, payer = payer, space = 8 + Message::LEN, seeds = [MESSAGE_SEED, &chat_id.to_le_bytes(), &message_index.to_le_bytes()], bump)]
    pub message: Account<'info, Message>,
    #[account(mut, seeds = [CHAT_SEED, &chat_id.to_le_bytes()], bump)]
    pub chat: Account<'info, Chat>,
    #[account(mut)]
    pub sender: Signer<'info>,
    /// Fee payer — treasury for gasless UX
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ========== FOLLOW CONTEXTS ==========

#[derive(Accounts)]
pub struct FollowUser<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + FollowAccount::LEN,
        seeds = [FOLLOW_SEED, follower_profile.owner.as_ref(), following_profile.owner.as_ref()],
        bump
    )]
    pub follow_account: Account<'info, FollowAccount>,
    #[account(mut, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub follower_profile: Account<'info, Profile>,
    #[account(mut, seeds = [PROFILE_SEED, following_profile.owner.as_ref()], bump)]
    pub following_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Fee payer — can be a server keypair for gasless UX
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnfollowUser<'info> {
    #[account(
        mut,
        close = treasury,
        seeds = [FOLLOW_SEED, follower_profile.owner.as_ref(), following_profile.owner.as_ref()],
        bump
    )]
    pub follow_account: Account<'info, FollowAccount>,
    #[account(mut, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub follower_profile: Account<'info, Profile>,
    #[account(mut, seeds = [PROFILE_SEED, following_profile.owner.as_ref()], bump)]
    pub following_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Treasury wallet — rent refund destination
    /// CHECK: This is the treasury wallet that originally paid rent
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

// ========== COMMUNITY CONTEXTS ==========

#[derive(Accounts)]
#[instruction(community_id: u64)]
pub struct CreateCommunity<'info> {
    #[account(init, payer = payer, space = 8 + Community::LEN, seeds = [COMMUNITY_SEED, &community_id.to_le_bytes()], bump)]
    pub community: Account<'info, Community>,
    #[account(seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub creator_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(community_id: u64)]
pub struct JoinCommunity<'info> {
    #[account(init, payer = payer, space = 8 + Membership::LEN, seeds = [MEMBERSHIP_SEED, community.key().as_ref(), member_profile.owner.as_ref()], bump)]
    pub membership: Account<'info, Membership>,
    #[account(mut, seeds = [COMMUNITY_SEED, &community_id.to_le_bytes()], bump)]
    pub community: Account<'info, Community>,
    #[account(seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub member_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(community_id: u64)]
pub struct LeaveCommunity<'info> {
    #[account(mut, close = treasury, seeds = [MEMBERSHIP_SEED, community.key().as_ref(), member_profile.owner.as_ref()], bump)]
    pub membership: Account<'info, Membership>,
    #[account(mut, seeds = [COMMUNITY_SEED, &community_id.to_le_bytes()], bump)]
    pub community: Account<'info, Community>,
    #[account(seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub member_profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: Treasury for rent refund
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(community_id: u64)]
pub struct UpdateCommunity<'info> {
    #[account(
        mut,
        seeds = [COMMUNITY_SEED, &community_id.to_le_bytes()],
        bump,
        constraint = community.creator == user.key() @ ShadowError::Unauthorized
    )]
    pub community: Account<'info, Community>,
    #[account(mut)]
    pub user: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(community_id: u64)]
pub struct CloseCommunity<'info> {
    #[account(
        mut,
        close = treasury,
        seeds = [COMMUNITY_SEED, &community_id.to_le_bytes()],
        bump,
        constraint = community.creator == user.key() @ ShadowError::Unauthorized
    )]
    pub community: Account<'info, Community>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: Treasury for rent refund
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

// ========== CLOSE ACCOUNT CONTEXTS ==========

#[derive(Accounts)]
pub struct CloseProfile<'info> {
    #[account(mut, close = treasury, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Treasury wallet — rent refund destination
    /// CHECK: This is the treasury wallet that originally paid rent
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct ClosePost<'info> {
    #[account(mut, close = treasury, seeds = [POST_SEED, user.key().as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(mut, seeds = [PROFILE_SEED, user.key().as_ref()], bump)]
    pub profile: Account<'info, Profile>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Treasury wallet — rent refund destination
    /// CHECK: This is the treasury wallet that originally paid rent
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(post_id: u64, comment_index: u64)]
pub struct CloseComment<'info> {
    #[account(mut, close = treasury, seeds = [COMMENT_SEED, post.key().as_ref(), &comment_index.to_le_bytes()], bump)]
    pub comment: Account<'info, Comment>,
    #[account(mut, seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(mut, constraint = user.key() == comment.author @ ShadowError::Unauthorized)]
    pub user: Signer<'info>,
    /// Treasury wallet — rent refund destination
    /// CHECK: This is the treasury wallet that originally paid rent
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(post_id: u64)]
pub struct CloseReaction<'info> {
    #[account(mut, close = treasury, seeds = [REACTION_SEED, post.key().as_ref(), user.key().as_ref()], bump)]
    pub reaction: Account<'info, Reaction>,
    #[account(seeds = [POST_SEED, post.author.as_ref(), &post_id.to_le_bytes()], bump)]
    pub post: Account<'info, Post>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// Treasury wallet — rent refund destination
    /// CHECK: This is the treasury wallet that originally paid rent
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(chat_id: u64)]
pub struct CloseChat<'info> {
    #[account(mut, close = treasury, seeds = [CHAT_SEED, &chat_id.to_le_bytes()], bump)]
    pub chat: Account<'info, Chat>,
    #[account(mut, constraint = user.key() == chat.user1 @ ShadowError::Unauthorized)]
    pub user: Signer<'info>,
    /// Treasury wallet — rent refund destination
    /// CHECK: This is the treasury wallet that originally paid rent
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(chat_id: u64, message_index: u64)]
pub struct CloseMessage<'info> {
    #[account(mut, close = treasury, seeds = [MESSAGE_SEED, &chat_id.to_le_bytes(), &message_index.to_le_bytes()], bump)]
    pub message: Account<'info, Message>,
    #[account(mut, constraint = user.key() == message.sender @ ShadowError::Unauthorized)]
    pub user: Signer<'info>,
    /// Treasury wallet — rent refund destination
    /// CHECK: This is the treasury wallet that originally paid rent
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
}

// ========== ADMIN FORCE CLOSE ==========

/// Only this wallet (the upgrade authority) can call admin_force_close
const ADMIN_AUTHORITY: Pubkey = pubkey!("8wf9jJrsUPtCrWwzXxXMkEQSWX2A4sSNAVRSNjuty4j");

#[derive(Accounts)]
pub struct AdminForceClose<'info> {
    /// CHECK: Any program-owned account to close. We verify it's owned by our program.
    #[account(mut, constraint = target_account.owner == &crate::ID @ ShadowError::Unauthorized)]
    pub target_account: AccountInfo<'info>,
    /// The upgrade authority — hardcoded, only this wallet can force-close
    #[account(mut, constraint = authority.key() == ADMIN_AUTHORITY @ ShadowError::Unauthorized)]
    pub authority: Signer<'info>,
}

// ========== DATA ACCOUNTS ==========

#[account]
pub struct Profile {
    pub owner: Pubkey,
    pub username: String,
    pub display_name: String,
    pub bio: String,
    pub is_private: bool,
    pub post_count: u32,
    pub follower_count: u32,
    pub following_count: u32,
    pub active_conversation_count: u16, // legacy field — must stay for deserialization
    pub created_at: i64,
    pub avatar_url: String,
    pub banner_url: String,
}

impl Profile {
    // 32(owner) + (4+16)(username) + (4+24)(display) + (4+64)(bio) + 1(private)
    // + 4(posts) + 4(followers) + 4(following) + 2(convos legacy) + 8(created)
    // + (4+128)(avatar) + (4+128)(banner)
    pub const LEN: usize = 32 + 4 + 16 + 4 + 24 + 4 + 64 + 1 + 4 + 4 + 4 + 2 + 8 + 4 + 128 + 4 + 128;
}

#[account]
pub struct Post {
    pub author: Pubkey,
    pub post_id: u64,
    pub content: String,
    pub is_private: bool,
    pub likes: u32,
    pub comment_count: u32,
    pub created_at: i64,
}

impl Post {
    // 32(author) + 8(post_id) + 4(str_prefix) + 500(content) + 1(private) + 4(likes) + 4(comments) + 8(timestamp)
    pub const LEN: usize = 32 + 8 + 4 + 500 + 1 + 4 + 4 + 8;
}

#[account]
pub struct Comment {
    pub post: Pubkey,
    pub author: Pubkey,
    pub comment_index: u64,
    pub content: String,
    pub created_at: i64,
}

impl Comment {
    // 32(post) + 32(author) + 8(index) + 4(str_prefix) + 100(content) + 8(timestamp)
    pub const LEN: usize = 32 + 32 + 8 + 4 + 100 + 8;
}

#[account]
pub struct Reaction {
    pub post: Pubkey,
    pub user: Pubkey,
    pub reaction_type: u8,
}

impl Reaction {
    pub const LEN: usize = 32 + 32 + 1;
}

#[account]
pub struct Chat {
    pub chat_id: u64,
    pub user1: Pubkey,
    pub user2: Pubkey,
    pub message_count: u64,
    pub created_at: i64,
}

impl Chat {
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8;
}

#[account]
pub struct Message {
    pub chat_id: u64,
    pub message_index: u64,
    pub sender: Pubkey,
    pub content: String,
    pub is_payment: bool,
    pub payment_amount: u64,
    pub timestamp: i64,
}

impl Message {
    pub const LEN: usize = 8 + 8 + 32 + 4 + 512 + 1 + 8 + 8;
}

#[account]
pub struct FollowAccount {
    pub follower: Pubkey,
    pub following: Pubkey,
}

impl FollowAccount {
    // 32(follower) + 32(following)
    pub const LEN: usize = 32 + 32;
}

#[account]
pub struct Community {
    pub creator: Pubkey,
    pub community_id: u64,
    pub name: String,
    pub description: String,
    pub avatar_url: String,
    pub member_count: u32,
    pub created_at: i64,
}

impl Community {
    // 32(creator) + 8(id) + (4+32)(name) + (4+128)(desc) + (4+128)(avatar) + 4(members) + 8(created)
    pub const LEN: usize = 32 + 8 + 4 + 32 + 4 + 128 + 4 + 128 + 4 + 8;
}

#[account]
pub struct Membership {
    pub community: Pubkey,
    pub member: Pubkey,
    pub joined_at: i64,
}

impl Membership {
    // 32(community) + 32(member) + 8(joined_at)
    pub const LEN: usize = 32 + 32 + 8;
}

// ========== ERRORS ==========

#[error_code]
pub enum ShadowError {
    #[msg("Already following this user")]
    AlreadyFollowing,
    #[msg("Not following this user")]
    NotFollowing,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Content too long")]
    ContentTooLong,
    #[msg("Cannot follow yourself")]
    CannotFollowSelf,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Community is full (max 100 members)")]
    CommunityFull,
}
